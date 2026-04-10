import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

const REPO_ROOT = process.cwd();
const DATABASE_URL = 'postgres://nodeadmin:nodeadmin@127.0.0.1:55432/nodeadmin';
const REDIS_URL = 'redis://127.0.0.1:56379';
const PORT = '11459';

export interface IntegrationContext {
  baseUrl: string;
  close: () => Promise<void>;
  http: ReturnType<typeof request>;
  issueDevToken: (userId: string, roles?: string[], tenantId?: string) => Promise<string>;
  uniqueId: (prefix: string) => string;
}

export async function createIntegrationContext(envOverrides?: Record<string, string>): Promise<IntegrationContext> {
  ensureIntegrationEnv(envOverrides);
  ensureInfrastructure();
  buildCoreApi();
  const serverProcess = await startCoreApiServer();
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const http = request(baseUrl);

  return {
    baseUrl,
    close: async () => {
      await stopCoreApiServer(serverProcess);
    },
    http,
    issueDevToken: async (userId: string, roles = ['admin'], tenantId = 'default') => {
      const response = await http.post('/api/v1/auth/dev-token').send({
        roles,
        tenantId,
        userId,
      });

      if (response.status !== 201 || typeof response.body?.accessToken !== 'string') {
        throw new Error(`Failed to issue dev token: status=${response.status}`);
      }

      return response.body.accessToken as string;
    },
    uniqueId: (prefix: string) => `${prefix}-${randomUUID()}`,
  };
}

function ensureIntegrationEnv(envOverrides?: Record<string, string>): void {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;
  process.env.PORT = PORT;
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-key';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key';
  process.env.FRONTEND_ORIGINS = process.env.FRONTEND_ORIGINS || 'http://localhost:3000';
  process.env.AUTH_ENABLE_DEV_TOKEN_ISSUE = 'true';
  process.env.KAFKA_BROKERS = '';
  process.env.OTEL_ENABLED = 'false';

  for (const [key, value] of Object.entries(envOverrides ?? {})) {
    process.env[key] = value;
  }
}

function ensureInfrastructure(): void {
  execFileSync('docker', ['compose', 'up', '-d', 'postgres', 'redis'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('node', ['scripts/applySqlMigration.cjs'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL,
    },
  });
}

function buildCoreApi(): void {
  execFileSync('npm', ['run', 'build', '-w', 'coreApi'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

async function startCoreApiServer(): Promise<ChildProcess> {
  const serverProcess = spawn('node', ['apps/coreApi/dist/main.js'], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'pipe',
  });

  let stderr = '';
  let stdout = '';

  serverProcess.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  serverProcess.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  await waitForHealth(serverProcess, () => `${stdout}\n${stderr}`.trim());

  return serverProcess;
}

async function stopCoreApiServer(serverProcess: ChildProcess): Promise<void> {
  if (serverProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess.kill('SIGKILL');
    }, 5000);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    serverProcess.kill('SIGTERM');
  });
}

async function waitForHealth(serverProcess: ChildProcess, readLogs: () => string): Promise<void> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`CoreApi exited before becoming healthy.\n${readLogs()}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until ready.
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  throw new Error(`Timed out waiting for CoreApi health.\n${readLogs()}`);
}
