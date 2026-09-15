#!/usr/bin/env node

const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATABASE_URL = 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
const DEFAULT_CONTAINER_NAME = 'nodeadmin-postgres';
const DOCKER_DATABASE_ENDPOINTS = new Set(['127.0.0.1:55432', 'localhost:55432', 'postgres:5432']);
const POST_RESTORE_PRIVILEGES_PATH = path.resolve(__dirname, 'postRestorePrivileges.sql');

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

function resolveBackupFile(inputPath, cwd = process.cwd()) {
  if (!inputPath || !inputPath.trim()) {
    throw new Error('BACKUP_FILE is required.');
  }

  const resolvedInputPath = path.resolve(cwd, inputPath.trim());
  if (!fs.existsSync(resolvedInputPath)) {
    throw new Error(`backup file does not exist: ${resolvedInputPath}`);
  }

  const stats = fs.statSync(resolvedInputPath);
  if (!stats.isFile()) {
    throw new Error(`backup path is not a regular file: ${resolvedInputPath}`);
  }
  if (stats.size === 0) {
    throw new Error(`backup file is empty: ${resolvedInputPath}`);
  }

  return resolvedInputPath;
}

function createLocalRestoreArgs(databaseUrl, inputPath) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  parsedDatabaseUrl.password = '';
  return [
    '--no-psqlrc',
    '--no-password',
    '--set=ON_ERROR_STOP=1',
    '--single-transaction',
    '--dbname',
    parsedDatabaseUrl.toString(),
    '--file',
    inputPath,
  ];
}

function createDockerRestoreArgs(databaseUrl, containerName = DEFAULT_CONTAINER_NAME) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  const endpoint = `${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port}`;
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !DOCKER_DATABASE_ENDPOINTS.has(endpoint) ||
    parsedDatabaseUrl.search ||
    parsedDatabaseUrl.hash
  ) {
    throw new Error(
      `Docker restore fallback cannot safely map database endpoint ${endpoint || '(missing)'}. Install psql locally.`,
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
    '-i',
    '--env',
    'PGPASSWORD',
    containerName,
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
    user,
    '-d',
    databaseName,
    '--file=-',
  ];
}

function runRestore(options) {
  const databaseUrl = (options.databaseUrl || DEFAULT_DATABASE_URL).trim();
  const inputPath = resolveBackupFile(options.inputPath, options.cwd);
  const spawnSync = options.spawnSync || cp.spawnSync;
  const commandEnv = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(new URL(databaseUrl).password),
  };
  const hasLocalPsql = options.commandExists ? options.commandExists('psql') : commandExists('psql', spawnSync);

  if (hasLocalPsql) {
    const result = spawnSync('psql', createLocalRestoreArgs(databaseUrl, inputPath), {
      env: commandEnv,
      shell: false,
      stdio: 'inherit',
    });
    assertSpawnSucceeded(result, 'local PostgreSQL restore');
    const hardeningResult = spawnSync('psql', createLocalRestoreArgs(databaseUrl, POST_RESTORE_PRIVILEGES_PATH), {
      env: commandEnv,
      shell: false,
      stdio: 'inherit',
    });
    assertSpawnSucceeded(hardeningResult, 'local post-restore privilege hardening');
    return { backupFile: inputPath, mode: 'local' };
  }

  const inputFd = fs.openSync(inputPath, 'r');
  try {
    const result = spawnSync('docker', createDockerRestoreArgs(databaseUrl, options.containerName), {
      env: commandEnv,
      shell: false,
      stdio: [inputFd, 'inherit', 'inherit'],
    });
    assertSpawnSucceeded(result, 'Docker PostgreSQL restore');
    const hardeningFd = fs.openSync(POST_RESTORE_PRIVILEGES_PATH, 'r');
    try {
      const hardeningResult = spawnSync('docker', createDockerRestoreArgs(databaseUrl, options.containerName), {
        env: commandEnv,
        shell: false,
        stdio: [hardeningFd, 'inherit', 'inherit'],
      });
      assertSpawnSucceeded(hardeningResult, 'Docker post-restore privilege hardening');
    } finally {
      fs.closeSync(hardeningFd);
    }
    return { backupFile: inputPath, mode: 'docker' };
  } finally {
    fs.closeSync(inputFd);
  }
}

function main(options = {}) {
  const env = options.env || process.env;
  const io = options.io || console;

  try {
    const result = runRestore({
      containerName: options.containerName,
      cwd: options.cwd,
      databaseUrl: env.DATABASE_URL,
      inputPath: env.BACKUP_FILE,
      commandExists: options.commandExists,
      spawnSync: options.spawnSync,
    });
    io.log(JSON.stringify({ ...result, result: 'ok' }, null, 2));
    return 0;
  } catch (error) {
    io.error('[postgresRestore] failed:', error);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  assertSpawnSucceeded,
  commandExists,
  createDockerRestoreArgs,
  createLocalRestoreArgs,
  main,
  resolveBackupFile,
  runRestore,
};
