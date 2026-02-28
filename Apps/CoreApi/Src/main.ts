import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './App/appModule';
import { UnifiedExceptionFilter } from './App/filters/unifiedExceptionFilter';
import { runtimeConfig } from './App/runtimeConfig';
import { startTelemetry, stopTelemetry } from './Infrastructure/Observability/telemetry';

async function bootstrap(): Promise<void> {
  await startTelemetry();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.LOG_LEVEL?.trim() || 'info',
      },
    }),
  );
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: runtimeConfig.corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new UnifiedExceptionFilter());
  app.enableShutdownHooks();

  if (runtimeConfig.security.enabled) {
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', (_request, reply, done) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'same-origin');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Content-Security-Policy', runtimeConfig.security.csp);
      done();
    });
  }

  await app.listen(runtimeConfig.port, '0.0.0.0');

  const shutdown = async (): Promise<void> => {
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
