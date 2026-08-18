import { pino, type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.secret',
  '*.SECRET',
  '*.csrfToken',
  '*.sessionToken',
  '*.signature',
  '*.authorization',
  '*.cookie',
  '*.pdfBytes',
  '*.documentBytes',
  'req.headers["x-csrf-token"]',
];

export type { Logger };

export type CreateLoggerOptions = {
  name: string;
  level: string;
};

export function createLogger(options: CreateLoggerOptions): Logger {
  const loggerOptions: LoggerOptions = {
    name: options.name,
    level: options.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      remove: true,
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  return pino(loggerOptions);
}

export function withCorrelationId(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}
