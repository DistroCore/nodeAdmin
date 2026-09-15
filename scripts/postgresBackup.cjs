#!/usr/bin/env node

const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATABASE_URL = 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
const DEFAULT_CONTAINER_NAME = 'nodeadmin-postgres';
const DOCKER_DATABASE_ENDPOINTS = new Set(['127.0.0.1:55432', 'localhost:55432', 'postgres:5432']);

function assertSpawnSucceeded(result, label) {
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function commandExists(commandName, spawnSync = cp.spawnSync) {
  const result = spawnSync(commandName, ['--version'], {
    shell: false,
    stdio: 'ignore',
  });

  if (result.error?.code === 'ENOENT') {
    return false;
  }
  assertSpawnSucceeded(result, `${commandName} probe`);
  return true;
}

function createLocalDumpArgs(databaseUrl, outputPath) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  parsedDatabaseUrl.password = '';
  return [
    '--dbname',
    parsedDatabaseUrl.toString(),
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--file',
    outputPath,
  ];
}

function createDockerDumpArgs(databaseUrl, containerName = DEFAULT_CONTAINER_NAME) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  const endpoint = `${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port}`;
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !DOCKER_DATABASE_ENDPOINTS.has(endpoint) ||
    parsedDatabaseUrl.search ||
    parsedDatabaseUrl.hash
  ) {
    throw new Error(
      `Docker backup fallback cannot safely map database endpoint ${endpoint || '(missing)'}. Install pg_dump locally.`,
    );
  }

  const user = decodeURIComponent(parsedDatabaseUrl.username);
  const password = decodeURIComponent(parsedDatabaseUrl.password);
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ''));
  if (!user || !password || !databaseName || databaseName.includes('/')) {
    throw new Error('DATABASE_URL must include one database name plus a user and password.');
  }

  return [
    'exec',
    '--env',
    'PGPASSWORD',
    containerName,
    'pg_dump',
    '-h',
    '127.0.0.1',
    '-p',
    '5432',
    '-U',
    user,
    '-d',
    databaseName,
    '--format=plain',
    '--no-owner',
    '--no-privileges',
  ];
}

function buildOutputPath(backupDir, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(backupDir, `nodeadmin-${timestamp}.sql`);
}

function validateBackupFile(outputPath) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`backup command did not create output: ${outputPath}`);
  }

  const stats = fs.lstatSync(outputPath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`backup output is empty or invalid: ${outputPath}`);
  }
}

function ensurePrivateDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { mode: 0o700, recursive: true });
  const stats = fs.lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`backup directory must be a real directory: ${directoryPath}`);
  }
  fs.chmodSync(directoryPath, 0o700);
}

function runBackup(options = {}) {
  const databaseUrl = (options.databaseUrl || DEFAULT_DATABASE_URL).trim();
  const backupDir = path.resolve(options.backupDir || path.resolve(__dirname, '..', 'Backups'));
  const outputPath = path.resolve(options.outputPath || buildOutputPath(backupDir, options.now));
  const partialPath = `${outputPath}.partial`;
  const spawnSync = options.spawnSync || cp.spawnSync;
  const commandEnv = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(new URL(databaseUrl).password),
  };
  const hasLocalPgDump = options.commandExists ? options.commandExists('pg_dump') : commandExists('pg_dump', spawnSync);

  ensurePrivateDirectory(path.dirname(outputPath));
  fs.rmSync(partialPath, { force: true });
  fs.closeSync(fs.openSync(partialPath, 'wx', 0o600));

  try {
    let mode;
    if (hasLocalPgDump) {
      const result = spawnSync('pg_dump', createLocalDumpArgs(databaseUrl, partialPath), {
        env: commandEnv,
        shell: false,
        stdio: 'inherit',
      });
      assertSpawnSucceeded(result, 'local PostgreSQL backup');
      mode = 'local';
    } else {
      const outputFd = fs.openSync(partialPath, 'w', 0o600);
      try {
        const result = spawnSync('docker', createDockerDumpArgs(databaseUrl, options.containerName), {
          env: commandEnv,
          shell: false,
          stdio: ['ignore', outputFd, 'inherit'],
        });
        assertSpawnSucceeded(result, 'Docker PostgreSQL backup');
      } finally {
        fs.closeSync(outputFd);
      }
      mode = 'docker';
    }

    validateBackupFile(partialPath);
    fs.chmodSync(partialPath, 0o600);
    fs.renameSync(partialPath, outputPath);
    return { mode, outputPath };
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  }
}

function main(options = {}) {
  const env = options.env || process.env;
  const io = options.io || console;

  try {
    const result = runBackup({
      backupDir: options.backupDir,
      commandExists: options.commandExists,
      containerName: options.containerName,
      databaseUrl: env.DATABASE_URL,
      now: options.now,
      outputPath: options.outputPath,
      spawnSync: options.spawnSync,
    });
    io.log(JSON.stringify({ ...result, result: 'ok' }, null, 2));
    return 0;
  } catch (error) {
    io.error('[postgresBackup] failed:', error);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  buildOutputPath,
  commandExists,
  createDockerDumpArgs,
  createLocalDumpArgs,
  ensurePrivateDirectory,
  main,
  runBackup,
  validateBackupFile,
};
