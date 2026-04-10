const cp = require('node:child_process');

async function run() {
  const env = {
    ...process.env,
    AUTH_ENABLE_DEV_TOKEN_ISSUE: process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE || 'true',
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin',
    FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS || 'http://localhost:3000',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-please-change',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-please-change',
    PORT: process.env.PORT || '11451',
  };

  const apiProcess = cp.spawn(process.execPath, ['apps/coreApi/dist/main.js'], {
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

  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (apiExitCode !== null) {
      throw new Error(`CoreApi exited before acceptance run. Exit code: ${apiExitCode}`);
    }
    if (apiSpawnError) {
      throw apiSpawnError;
    }

    try {
      const response = await fetch('http://127.0.0.1:11451/api/v1/health');
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
    cp.execSync('npm run m1:acceptance', {
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
  console.error('[runM1AcceptanceWithApi] failed:', error);
  process.exit(1);
});
