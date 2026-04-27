import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import { AppModule } from './appModule';
import { UnifiedExceptionFilter } from './filters/unifiedExceptionFilter';
import { runtimeConfig } from './runtimeConfig';
import { startTelemetry } from '../infrastructure/observability/telemetry';
import { resolveCspPolicy } from '../infrastructure/security/cspPolicy';
import { HttpRateLimiter } from '../infrastructure/security/httpRateLimiter';

export async function createApp(): Promise<NestFastifyApplication> {
  const logger = new Logger('AppBootstrap');
  const rateLimiter = new HttpRateLimiter();
  const cspResult = resolveCspPolicy(runtimeConfig.security.csp);

  if (!cspResult.valid) {
    for (const issue of cspResult.issues) {
      logger.warn(`${issue}. Falling back to the default CSP policy.`);
    }
  }

  await startTelemetry();

  const rootModule = await AppModule.forRootAsync();

  const app = await NestFactory.create<NestFastifyApplication>(
    rootModule,
    new FastifyAdapter({
      logger: {
        level: process.env.LOG_LEVEL?.trim() || 'info',
      },
      connectionTimeout: runtimeConfig.fastify.connectionTimeout,
      keepAliveTimeout: runtimeConfig.fastify.keepAliveTimeout,
      requestTimeout: runtimeConfig.fastify.requestTimeout,
      bodyLimit: runtimeConfig.fastify.bodyLimit,
      maxParamLength: runtimeConfig.fastify.maxParamLength,
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['/uploads/(.*)'],
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: runtimeConfig.upload.maxFileSize,
    },
  });
  await fastify.register(fastifyStatic, {
    root: join(process.cwd(), runtimeConfig.upload.storagePath),
    prefix: '/uploads/',
    decorateReply: false,
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

  fastify.addHook('onRequest', (request, reply, done) => {
    const pathname = request.url.split('?')[0];
    const isAuthPath = pathname.startsWith('/api/v1/auth/');
    const isExcludedPath = pathname === '/api/v1/health' || pathname.startsWith('/uploads/');

    if (runtimeConfig.security.enabled) {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'same-origin');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Content-Security-Policy', cspResult.policy);
    }

    if (isExcludedPath) {
      done();
      return;
    }

    const limit = isAuthPath
      ? runtimeConfig.rateLimit.authRequestsPerMinute
      : runtimeConfig.rateLimit.httpRequestsPerMinute;
    const decision = rateLimiter.check(`${request.ip}::${isAuthPath ? 'auth' : 'http'}`, limit, 60_000);

    reply.header('X-RateLimit-Limit', String(decision.limit));
    reply.header('X-RateLimit-Remaining', String(decision.remaining));
    reply.header('X-RateLimit-Reset', String(decision.retryAfterSeconds));

    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry later.',
        statusCode: 429,
      });
      return;
    }

    done();
  });

  if (runtimeConfig.security.enabled) {
    logger.log(
      `HTTP rate limiting enabled (general=${runtimeConfig.rateLimit.httpRequestsPerMinute}/min, auth=${runtimeConfig.rateLimit.authRequestsPerMinute}/min).`,
    );
  }

  if (runtimeConfig.swagger.enabled) {
    const config = new DocumentBuilder()
      .setTitle('nodeAdmin API')
      .setDescription('Enterprise multi-tenant SaaS middleware platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  return app;
}
