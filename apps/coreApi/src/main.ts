import { runtimeConfig } from './app/runtimeConfig';
import { createApp } from './app/createApp';
import { stopTelemetry } from './infrastructure/observability/telemetry';

async function bootstrap(): Promise<void> {
  const app = await createApp();

  await app.listen(runtimeConfig.port, '0.0.0.0');

  const shutdown = async (): Promise<void> => {
    await app.close();
    await stopTelemetry();
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

void bootstrap();
