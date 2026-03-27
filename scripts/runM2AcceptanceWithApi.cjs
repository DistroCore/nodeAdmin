const cp = require('node:child_process');

async function run() {
  const env = {
    ...process.env,
    AUTH_ENABLE_DEV_TOKEN_ISSUE: process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE || 'true',
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin',
    FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS || 'http://localhost:5173',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-please-change',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-please-change',
    KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
    OUTBOX_BATCH_SIZE: process.env.OUTBOX_BATCH_SIZE || '100',
    OUTBOX_POLL_INTERVAL_MS: process.env.OUTBOX_POLL_INTERVAL_MS || '500',
    OUTBOX_PUBLISHER_ENABLED: process.env.OUTBOX_PUBLISHER_ENABLED || 'true',
    OUTBOX_TOPIC: process.env.OUTBOX_TOPIC || 'im.events',
    PORT: process.env.PORT || '3001',
  };

  const apiProcess = cp.spawn(process.execPath, ['apps/core-api/Dist/main.js'], {
    env,
    stdio: 'inherit',
  });

  let apiExitCode = null;
  let apiSpawnError = null;

  apiProcess.on('error', (error) => {
    apiSpawnError = error;
  });

  apiProcess.on('exit', (code) => {
    apiExitCode = code ?? 0;
  });

  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (apiExitCode !== null) {
      throw new Error(`CoreApi exited before M2 acceptance run. Exit code: ${apiExitCode}`);
    }
    if (apiSpawnError) {
      throw apiSpawnError;
    }

    try {
      const response = await fetch('http://127.0.0.1:3001/api/v1/health');
      if (response.ok) {
        break;
      }
    } catch {
      // ignore and retry
    }

    if (attempt === maxAttempts) {
      throw new Error('CoreApi did not become ready in time.');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  let exitCode = 0;
  try {
    cp.execSync('npm run m2:acceptance', {
      env,
      stdio: 'inherit',
    });
  } catch {
    exitCode = 1;
  } finally {
    if (apiExitCode === null) {
      apiProcess.kill('SIGTERM');
    }
  }

  process.exit(exitCode);
}

run().catch((error) => {
  console.error('[runM2AcceptanceWithApi] failed:', error);
  process.exit(1);
});
