const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const databaseUrl = (process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin').trim();
const backupDir = path.resolve(__dirname, '..', 'Backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(backupDir, `nodeadmin-${timestamp}.sql`);
const parsedDatabaseUrl = new URL(databaseUrl);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

function commandExists(commandName) {
  try {
    cp.execSync(`where ${commandName}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const localDumpCommand = `pg_dump "${databaseUrl}" --format=plain --no-owner --no-privileges --file "${outputPath}"`;
const dockerDumpCommand = [
  'docker exec nodeadmin-postgres',
  `pg_dump -U ${parsedDatabaseUrl.username} -d ${parsedDatabaseUrl.pathname.replace('/', '')} --format=plain --no-owner --no-privileges`,
  `> "${outputPath}"`,
].join(' ');
const command = commandExists('pg_dump') ? localDumpCommand : dockerDumpCommand;

try {
  cp.execSync(command, { stdio: 'inherit' });
  console.log(
    JSON.stringify(
      {
        outputPath,
        result: 'ok',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('[postgresBackup] failed:', error);
  process.exit(1);
}
