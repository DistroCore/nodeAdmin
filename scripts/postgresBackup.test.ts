import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync as spawnProcessSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import backup from './postgresBackup.cjs';

const { createDockerDumpArgs, runBackup } = backup as {
  createDockerDumpArgs: (databaseUrl: string, containerName?: string) => string[];
  runBackup: (options?: {
    backupDir?: string;
    commandExists?: (commandName: string) => boolean;
    containerName?: string;
    databaseUrl?: string;
    now?: Date;
    outputPath?: string;
    spawnSync?: ReturnType<typeof vi.fn>;
  }) => { mode: 'docker' | 'local'; outputPath: string };
};

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'postgres-backup-test-'));
});

afterEach(() => {
  rmSync(workspace, { force: true, recursive: true });
});

describe('postgresBackup', () => {
  it('publishes a non-empty local dump atomically', () => {
    const outputPath = join(workspace, 'backup with spaces;$(safe).sql');
    const spawnSync = vi.fn((command: string, args: string[]) => {
      expect(command).toBe('pg_dump');
      const partialPath = args[args.indexOf('--file') + 1];
      writeFileSync(partialPath, 'SELECT 1;\n', 'utf8');
      return { status: 0 };
    });

    const result = runBackup({
      commandExists: () => true,
      outputPath,
      spawnSync,
    });

    expect(result).toEqual({ mode: 'local', outputPath });
    expect(readFileSync(outputPath, 'utf8')).toBe('SELECT 1;\n');
    expect(() => readFileSync(`${outputPath}.partial`)).toThrow();
    expect(spawnSync).toHaveBeenCalledWith(
      'pg_dump',
      expect.arrayContaining([
        '--dbname',
        'postgres://nodeadmin@localhost:55432/nodeadmin',
        '--file',
        `${outputPath}.partial`,
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: 'nodeadmin' }),
        shell: false,
        stdio: 'inherit',
      }),
    );
  });

  it('rejects a zero-byte dump even when pg_dump exits successfully', () => {
    const outputPath = join(workspace, 'empty.sql');
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const partialPath = args[args.indexOf('--file') + 1];
      writeFileSync(partialPath, '', 'utf8');
      return { status: 0 };
    });

    expect(() => runBackup({ commandExists: () => true, outputPath, spawnSync })).toThrow(
      'backup output is empty or invalid',
    );
    expect(() => readFileSync(outputPath)).toThrow();
    expect(() => readFileSync(`${outputPath}.partial`)).toThrow();
  });

  it('removes a partial dump after local pg_dump fails without falling back', () => {
    const outputPath = join(workspace, 'partial.sql');
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const partialPath = args[args.indexOf('--file') + 1];
      writeFileSync(partialPath, 'PARTIAL', 'utf8');
      return { status: 42 };
    });

    expect(() => runBackup({ commandExists: () => true, outputPath, spawnSync })).toThrow(
      'local PostgreSQL backup failed with exit code 42',
    );
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(() => readFileSync(`${outputPath}.partial`)).toThrow();
  });

  it('streams Docker pg_dump output into the partial file before publishing', () => {
    const outputPath = join(workspace, 'docker.sql');
    const spawnSync = vi.fn(
      (
        command: string,
        args: string[],
        options: { env: Record<string, string | undefined>; stdio: [string, number, string] },
      ) => {
        expect(command).toBe('docker');
        expect(args).toContain('pg_dump');
        expect(options.env.PGPASSWORD).toBe('nodeadmin');
        writeFileSync(options.stdio[1], 'CREATE TABLE restored(id integer);\n', 'utf8');
        return { status: 0 };
      },
    );

    const result = runBackup({
      commandExists: () => false,
      outputPath,
      spawnSync,
    });

    expect(result.mode).toBe('docker');
    expect(readFileSync(outputPath, 'utf8')).toContain('CREATE TABLE restored');
  });

  it('rejects Docker fallback for a remote database URL', () => {
    expect(() =>
      runBackup({
        commandExists: () => false,
        databaseUrl: 'postgres://user:pass@db.example.com:5432/nodeadmin',
        outputPath: join(workspace, 'remote.sql'),
        spawnSync: vi.fn(),
      }),
    ).toThrow('cannot safely map database endpoint db.example.com:5432');
  });

  it.each([
    'postgres://user:pass@localhost:1/nodeadmin',
    'postgres://user:pass@pgbouncer:5432/nodeadmin',
    'postgres://user:pass@localhost:55432/nodeadmin?sslmode=require',
  ])('rejects an unmapped Docker endpoint: %s', (databaseUrl) => {
    expect(() =>
      runBackup({
        commandExists: () => false,
        databaseUrl,
        outputPath: join(workspace, 'wrong-target.sql'),
        spawnSync: vi.fn(),
      }),
    ).toThrow('cannot safely map database endpoint');
  });

  it('creates a private backup directory and dump file', () => {
    const backupDir = join(workspace, 'private-backups');
    const spawnSync = vi.fn((command: string, args: string[]) => {
      writeFileSync(args[args.indexOf('--file') + 1], 'SELECT 1;\n', 'utf8');
      return { status: 0 };
    });

    const { outputPath } = runBackup({ backupDir, commandExists: () => true, spawnSync });

    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
  });

  it('tightens an existing backup directory to owner-only access', () => {
    const backupDir = join(workspace, 'existing-backups');
    mkdirSync(backupDir, { mode: 0o755 });
    chmodSync(backupDir, 0o755);
    const spawnSync = vi.fn((command: string, args: string[]) => {
      writeFileSync(args[args.indexOf('--file') + 1], 'SELECT 1;\n', 'utf8');
      return { status: 0 };
    });

    runBackup({ backupDir, commandExists: () => true, spawnSync });

    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
  });

  it('publishes the shell backup without following a pre-existing symlink', () => {
    const backupDir = join(workspace, 'shell-backups');
    const fakeBin = join(workspace, 'bin');
    const outsideTarget = join(workspace, 'outside-target');
    const backupPath = join(backupDir, 'nodeadmin_backup_20260710_081500.sql.gz');
    mkdirSync(backupDir, { mode: 0o755 });
    mkdirSync(fakeBin);
    writeFileSync(outsideTarget, 'do-not-overwrite', { mode: 0o644 });
    symlinkSync(outsideTarget, backupPath);

    const dockerPath = join(fakeBin, 'docker');
    writeFileSync(
      dockerPath,
      `#!/bin/sh\ncase "$1" in\n  ps) echo nodeadmin-postgres ;;\n  exec)\n    case "$*" in\n      *pg_isready*) exit 0 ;;\n      *pg_dump*) printf '%s\\n' 'CREATE TABLE users (id text);' ;;\n    esac\n    ;;\nesac\n`,
      { mode: 0o700 },
    );
    const datePath = join(fakeBin, 'date');
    writeFileSync(
      datePath,
      `#!/bin/sh\nif [ "$1" = "+%Y%m%d_%H%M%S" ]; then echo 20260710_081500; else echo 1783652100; fi\n`,
      { mode: 0o700 },
    );

    const result = spawnProcessSync('bash', [resolve(process.cwd(), 'scripts/backup-postgres.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BACKUP_DIR: backupDir,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(lstatSync(backupPath).isSymbolicLink()).toBe(false);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(readFileSync(outsideTarget, 'utf8')).toBe('do-not-overwrite');
  });

  it('builds Docker arguments without shell redirection', () => {
    const args = createDockerDumpArgs('postgres://nodeadmin_app:nodeadmin@localhost:55432/nodeadmin');

    expect(args).toEqual([
      'exec',
      '--env',
      'PGPASSWORD',
      'nodeadmin-postgres',
      'pg_dump',
      '-h',
      '127.0.0.1',
      '-p',
      '5432',
      '-U',
      'nodeadmin_app',
      '-d',
      'nodeadmin',
      '--format=plain',
      '--no-owner',
      '--no-privileges',
    ]);
    expect(args).not.toContain('>');
    expect(args.join(' ')).not.toContain('PGPASSWORD=nodeadmin');
  });

  it('keeps the compressed shell backup private', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/backup-postgres.sh'), 'utf8');

    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('umask 077');
    expect(script).toContain('chmod 700 "${BACKUP_DIR}"');
    expect(script).toContain('mktemp "${BACKUP_DIR}/.nodeadmin_backup_${TIMESTAMP}.XXXXXX"');
    expect(script).toContain('mv -f "${PARTIAL_PATH}" "${BACKUP_PATH}"');
    expect(script).not.toContain('gzip > "${BACKUP_PATH}"');
    expect(script).not.toContain('2>&1 | gzip');
    expect(script).not.toContain('--verbose');
    expect(script).toContain('stat -c%s');
    expect(script).toContain('stat -f%z');
    expect(script).toContain('postgres_backup_size_bytes ${BACKUP_SIZE_BYTES}');
  });
});
