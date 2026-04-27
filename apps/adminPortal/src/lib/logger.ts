type LogLevel = 'error' | 'info' | 'warn';

interface LogEntry {
  context: string;
  data?: unknown;
  level: LogLevel;
  message: string;
  timestamp: string;
}

function log(level: LogLevel, context: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    context,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined ? { data } : {}),
  };

  if (!import.meta.env.DEV) {
    return;
  }

  const output = `[${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}`;

  if (level === 'error') {
    console.error(output, data ?? '');
    return;
  }

  if (level === 'warn') {
    console.warn(output, data ?? '');
    return;
  }

  console.info(output, data ?? '');
}

export const logger = {
  error: (context: string, message: string, data?: unknown) => log('error', context, message, data),
  info: (context: string, message: string, data?: unknown) => log('info', context, message, data),
  warn: (context: string, message: string, data?: unknown) => log('warn', context, message, data),
};
