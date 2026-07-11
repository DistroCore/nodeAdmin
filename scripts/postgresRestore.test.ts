import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import restore from './postgresRestore.cjs';

const { commandExists, createDockerRestoreArgs, runRestore } = restore as {
  commandExists: (commandName: string, spawnSync?: ReturnType<typeof vi.fn>) => boolean;
  createDockerRestoreArgs: (databaseUrl: string, containerName?: string) => string[];
  runRestore: (options: {
    commandExists?: (commandName: string) => boolean;
    containerName?: string;
    cwd?: string;
    databaseUrl?: string;
    inputPath: string;
    spawnSync?: ReturnType<typeof vi.fn>;
  }) => { backupFile: string; mode: 'docker' | 'local' };
};

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'postgres-restore-test-'));
});

afterEach(() => {
  rmSync(workspace, { force: true, recursive: true });
});

function writeBackup(filename = 'backup.sql', content = 'SELECT 1;\n'): string {
  const backupPath = join(workspace, filename);
  writeFileSync(backupPath, content, 'utf8');
  return backupPath;
}

describe('postgresRestore', () => {
  it('rejects missing, non-file, and empty backup inputs before spawning commands', () => {
    const emptyPath = writeBackup('empty.sql', '');
    const spawnSync = vi.fn();

    expect(() => runRestore({ cwd: workspace, inputPath: 'missing.sql', spawnSync })).toThrow(
      'backup file does not exist',
    );
    expect(() => runRestore({ cwd: workspace, inputPath: '.', spawnSync })).toThrow(
      'backup path is not a regular file',
    );
    expect(() => runRestore({ inputPath: emptyPath, spawnSync })).toThrow('backup file is empty');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('runs local psql with atomic error-stop flags and keeps special paths as one argument', () => {
    const backupPath = writeBackup('backup with spaces;$(safe).sql');
    const spawnSync = vi.fn().mockReturnValue({ status: 0 });
    const databaseUrl = 'postgres://user:p%40ss@localhost:55432/node-admin';

    const result = runRestore({
      commandExists: () => true,
      databaseUrl,
      inputPath: backupPath,
      spawnSync,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        '--dbname',
        'postgres://user@localhost:55432/node-admin',
        '--file',
        backupPath,
      ],
      expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: 'p@ss' }),
        shell: false,
        stdio: 'inherit',
      }),
    );
    expect(result).toEqual({ backupFile: backupPath, mode: 'local' });
  });

  it('fails on psql status 3 without falling back to Docker', () => {
    const backupPath = writeBackup();
    const spawnSync = vi.fn().mockReturnValue({ status: 3 });

    expect(() => runRestore({ commandExists: () => true, inputPath: backupPath, spawnSync })).toThrow(
      'local PostgreSQL restore failed with exit code 3',
    );
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith('psql', expect.any(Array), expect.any(Object));
  });

  it('streams the exact backup file into the Docker psql fallback', () => {
    const sql = 'CREATE TABLE restore_probe(id integer);\n';
    const backupPath = writeBackup('docker.sql', sql);
    const receivedSql: string[] = [];
    const spawnSync = vi.fn(
      (
        command: string,
        args: string[],
        options: { env: Record<string, string | undefined>; stdio: [number, string, string] },
      ) => {
        expect(command).toBe('docker');
        expect(args).toContain('--file=-');
        expect(options.env.PGPASSWORD).toBe('nodeadmin');
        receivedSql.push(readFileSync(options.stdio[0], 'utf8'));
        return { status: 0 };
      },
    );

    const result = runRestore({
      commandExists: () => false,
      inputPath: backupPath,
      spawnSync,
    });

    expect(receivedSql[0]).toBe(sql);
    expect(receivedSql[1]).toContain('GRANT SELECT, UPDATE, DELETE ON TABLE outbox_events TO nodeadmin_outbox');
    expect(receivedSql[1]).toContain('relforcerowsecurity');
    expect(result.mode).toBe('docker');
  });

  it('fails when the Docker restore command exits non-zero', () => {
    const backupPath = writeBackup();
    const spawnSync = vi.fn().mockReturnValue({ status: 2 });

    expect(() => runRestore({ commandExists: () => false, inputPath: backupPath, spawnSync })).toThrow(
      'Docker PostgreSQL restore failed with exit code 2',
    );
  });

  it('rejects Docker fallback for a remote database URL', () => {
    const backupPath = writeBackup();

    expect(() =>
      runRestore({
        commandExists: () => false,
        databaseUrl: 'postgres://user:pass@db.example.com:5432/nodeadmin',
        inputPath: backupPath,
        spawnSync: vi.fn(),
      }),
    ).toThrow('cannot safely map database endpoint db.example.com:5432');
  });

  it.each([
    'postgres://user:pass@localhost:1/nodeadmin',
    'postgres://user:pass@pgbouncer:5432/nodeadmin',
    'postgres://user:pass@localhost:55432/nodeadmin?sslmode=require',
  ])('rejects an unmapped Docker endpoint: %s', (databaseUrl) => {
    const backupPath = writeBackup();

    expect(() =>
      runRestore({
        commandExists: () => false,
        databaseUrl,
        inputPath: backupPath,
        spawnSync: vi.fn(),
      }),
    ).toThrow('cannot safely map database endpoint');
  });

  it('distinguishes a missing executable from an executable probe failure', () => {
    const missingError = Object.assign(new Error('not found'), { code: 'ENOENT' });
    expect(commandExists('psql', vi.fn().mockReturnValue({ error: missingError, status: null }))).toBe(false);
    expect(() => commandExists('psql', vi.fn().mockReturnValue({ status: 1 }))).toThrow(
      'psql probe failed with exit code 1',
    );
  });

  it('builds Docker arguments without a shell pipeline', () => {
    const args = createDockerRestoreArgs('postgres://nodeadmin_app:nodeadmin@localhost:55432/nodeadmin');

    expect(args).toEqual([
      'exec',
      '-i',
      '--env',
      'PGPASSWORD',
      'nodeadmin-postgres',
      'psql',
      '--no-psqlrc',
      '--no-password',
      '--set=ON_ERROR_STOP=1',
      '--single-transaction',
      '-h',
      '127.0.0.1',
      '-p',
      '5432',
      '-U',
      'nodeadmin_app',
      '-d',
      'nodeadmin',
      '--file=-',
    ]);
    expect(args.join(' ')).not.toContain('type ');
    expect(args).not.toContain('|');
    expect(args.join(' ')).not.toContain('PGPASSWORD=nodeadmin');
  });

  it('keeps the shell restore wrapper fail-fast and atomic', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/restore-postgres.sh'), 'utf8');

    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('umask 077');
    expect(script).toContain('--set=ON_ERROR_STOP=1');
    expect(script).toContain('--single-transaction');
    expect(script).toContain('--file=-');
    expect(script).toContain("table_name IN ('audit_logs', 'conversations', 'messages', 'outbox_events')");
    expect(script).toContain('if [ "${CORE_TABLE_COUNT}" -ne 4 ]');
    expect(script).toContain('POST_RESTORE_PRIVILEGES_PATH');
    expect(script).toContain('chmod 600 "${RESTORE_ERROR_LOG}"');
  });
});
