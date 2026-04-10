const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const databaseUrl = (process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin').trim();
const inputPath = (process.env.BACKUP_FILE || '').trim();
const parsedDatabaseUrl = new URL(databaseUrl);

if (!inputPath) {
  console.error('[postgresRestore] BACKUP_FILE is required.');
  process.exit(1);
}

const resolvedInputPath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(resolvedInputPath)) {
  console.error(`[postgresRestore] backup file does not exist: ${resolvedInputPath}`);
  process.exit(1);
}

function commandExists(commandName) {
  try {
    cp.execSync(`where ${commandName}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const localRestoreCommand = `psql "${databaseUrl}" -f "${resolvedInputPath}"`;
const dockerRestoreCommand = [
  `type "${resolvedInputPath}"`,
  '|',
  `docker exec -i nodeadmin-postgres psql -U ${parsedDatabaseUrl.username} -d ${parsedDatabaseUrl.pathname.replace('/', '')}`,
].join(' ');
const command = commandExists('psql') ? localRestoreCommand : dockerRestoreCommand;

try {
  cp.execSync(command, { stdio: 'inherit' });
  console.log(
    JSON.stringify(
      {
        backupFile: resolvedInputPath,
        result: 'ok',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('[postgresRestore] failed:', error);
  process.exit(1);
}
