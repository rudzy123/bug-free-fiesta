import { pino, type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.headers.referer',
  'req.headers.referrer',
  'req.query',
  'req.query.token',
  'req.url',
  'req.originalUrl',
  'rawToken',
  'token',
  'secret',
  'sessionToken',
  'csrfToken',
  'signature',
  '*.password',
  '*.token',
  '*.secret',
  '*.SECRET',
  '*.csrfToken',
  '*.sessionToken',
  '*.rawToken',
  '*.signature',
  '*.authorization',
  '*.cookie',
  '*.pdfBytes',
  '*.documentBytes',
  'req.headers["x-csrf-token"]',
];

import type { DestinationStream } from 'pino';

export type { Logger };

export type CreateLoggerOptions = {
  name: string;
  level: string;
  destination?: DestinationStream;
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

  return options.destination === undefined
    ? pino(loggerOptions)
    : pino(loggerOptions, options.destination);
}

export function withCorrelationId(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}
