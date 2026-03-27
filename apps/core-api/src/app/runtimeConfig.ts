interface RuntimeConfig {
  auth: {
    accessExpiresIn: string;
    accessSecret: string;
    enableDevTokenIssue: boolean;
    refreshExpiresIn: string;
    refreshSecret: string;
  };
  corsOrigins: string[];
  kafka: {
    brokers: string[];
    clientId: string;
    dlqTopic: string;
    topic: string;
  };
  outbox: {
    batchSize: number;
    enabled: boolean;
    maxRetry: number;
    pollIntervalMs: number;
  };
  redis: {
    url: string | null;
    connectTimeout: number;
    commandTimeout: number;
    pingInterval: number;
    commandsQueueMaxLength: number;
    maxRetries: number;
  };
  security: {
    csp: string;
    enabled: boolean;
  };
  telemetry: {
    enabled: boolean;
    metricsPort: number;
    otlpEndpoint: string | null;
    serviceName: string;
  };
  port: number;
  rateLimit: {
    wsMessagesPerSecond: number;
  };
  socketio: {
    pingInterval: number;
    pingTimeout: number;
  };
  database: {
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
    statementTimeoutMillis: number;
  };
  fastify: {
    connectionTimeout: number;
    keepAliveTimeout: number;
    requestTimeout: number;
    bodyLimit: number;
    maxParamLength: number;
  };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function readCsvEnv(name: string): string[] {
  const rawValue = readRequiredEnv(name);
  const values = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error(`[config] ${name} must contain at least one origin.`);
  }

  return values;
}

function readOptionalCsvEnv(name: string): string[] {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readPort(): number {
  const rawPort = process.env.PORT ?? '3001';
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`[config] Invalid PORT: ${rawPort}`);
  }

  return port;
}

function readPositiveInt(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[config] ${name} must be a positive integer.`);
  }

  return parsed;
}

export const runtimeConfig: RuntimeConfig = {
  auth: {
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN?.trim() || '15m',
    accessSecret: readRequiredEnv('JWT_ACCESS_SECRET'),
    enableDevTokenIssue: readBooleanEnv('AUTH_ENABLE_DEV_TOKEN_ISSUE', true),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN?.trim() || '7d',
    refreshSecret: readRequiredEnv('JWT_REFRESH_SECRET'),
  },
  corsOrigins: readCsvEnv('FRONTEND_ORIGINS'),
  kafka: {
    brokers: readOptionalCsvEnv('KAFKA_BROKERS'),
    clientId: process.env.KAFKA_CLIENT_ID?.trim() || 'core-api-outbox',
    dlqTopic: process.env.OUTBOX_DLQ_TOPIC?.trim() || 'im.events.dlq',
    topic: process.env.OUTBOX_TOPIC?.trim() || 'im.events',
  },
  outbox: {
    batchSize: readPositiveInt('OUTBOX_BATCH_SIZE', 100),
    enabled: readBooleanEnv('OUTBOX_PUBLISHER_ENABLED', false),
    maxRetry: readPositiveInt('OUTBOX_MAX_RETRY', 5),
    pollIntervalMs: readPositiveInt('OUTBOX_POLL_INTERVAL_MS', 2000),
  },
  port: readPort(),
  rateLimit: {
    wsMessagesPerSecond: readPositiveInt('WS_RATE_LIMIT_PER_SECOND', 10),
  },
  redis: {
    url: process.env.REDIS_URL?.trim() || null,
    connectTimeout: readPositiveInt('REDIS_CONNECT_TIMEOUT', 10000),
    commandTimeout: readPositiveInt('REDIS_COMMAND_TIMEOUT', 5000),
    pingInterval: readPositiveInt('REDIS_PING_INTERVAL', 15000),
    commandsQueueMaxLength: readPositiveInt('REDIS_COMMANDS_QUEUE_MAX_LENGTH', 1000),
    maxRetries: readPositiveInt('REDIS_MAX_RETRIES', 10),
  },
  security: {
    csp:
      process.env.SECURITY_CSP?.trim() ||
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss: http: https:",
    enabled: readBooleanEnv('SECURITY_HEADERS_ENABLED', true),
  },
  telemetry: {
    enabled: readBooleanEnv('OTEL_ENABLED', false),
    metricsPort: readPositiveInt('OTEL_METRICS_PORT', 9464),
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || null,
    serviceName: process.env.OTEL_SERVICE_NAME?.trim() || 'core-api',
  },
  socketio: {
    pingInterval: readPositiveInt('SOCKETIO_PING_INTERVAL', 25000),
    pingTimeout: readPositiveInt('SOCKETIO_PING_TIMEOUT', 60000),
  },
  database: {
    connectionTimeoutMillis: readPositiveInt('PG_CONNECTION_TIMEOUT', 15000),
    idleTimeoutMillis: readPositiveInt('PG_IDLE_TIMEOUT', 300000),
    statementTimeoutMillis: readPositiveInt('PG_STATEMENT_TIMEOUT', 30000),
  },
  fastify: {
    connectionTimeout: readPositiveInt('FASTIFY_CONNECTION_TIMEOUT', 60000),
    keepAliveTimeout: readPositiveInt('FASTIFY_KEEP_ALIVE_TIMEOUT', 65000),
    requestTimeout: readPositiveInt('FASTIFY_REQUEST_TIMEOUT', 30000),
    bodyLimit: readPositiveInt('FASTIFY_BODY_LIMIT', 10485760),
    maxParamLength: readPositiveInt('FASTIFY_MAX_PARAM_LENGTH', 500),
  },
};
