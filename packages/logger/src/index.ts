import { pino, type Logger, type LoggerOptions } from 'pino';

import type { DestinationStream } from 'pino';

/**
 * Field names that must never appear in logs, alerts, traces, or metrics labels.
 * Sourced from the data-classification "Restricted" class. Kept as an exported
 * constant so tests and the redaction-audit script assert against one list.
 */
export const PROHIBITED_LOG_FIELDS = [
  // Authentication material
  'password',
  'secret',
  'SECRET',
  'token',
  'rawToken',
  'sessionToken',
  'csrfToken',
  'authorization',
  'cookie',
  'setCookie',
  'bearer',
  // Signature capture material (Restricted)
  'signature',
  'signaturePng',
  'signatureImage',
  'initials',
  'initialsPng',
  'png',
  'dataUrl',
  'dataURL',
  'points',
  'strokes',
  'pointer',
  'pointerStream',
  // Document content (Restricted)
  'pdf',
  'pdfBytes',
  'documentBytes',
  'documentContent',
  'content',
  'bytes',
  'buffer',
  // Private storage locations
  'signedUrl',
  'presignedUrl',
  'storageUrl',
  'objectUrl',
  'downloadUrl',
  'uploadUrl',
  'previewUrl',
] as const;

export type ProhibitedLogField = (typeof PROHIBITED_LOG_FIELDS)[number];

export type PiiClass = 'public' | 'internal' | 'confidential' | 'restricted';

export type FieldClassification = {
  readonly class: PiiClass;
  readonly loggable: boolean;
};

/**
 * Classification for fields that commonly flow through logging. `loggable`
 * mirrors the data-classification allow/deny lists: only Public/Internal and a
 * small set of opaque Confidential identifiers may be logged. Everything
 * Restricted is redacted. Used by the redaction-audit test and script.
 */
export const PII_FIELD_CLASSIFICATION: Record<string, FieldClassification> = {
  correlationId: { class: 'internal', loggable: true },
  requestId: { class: 'internal', loggable: true },
  route: { class: 'internal', loggable: true },
  method: { class: 'internal', loggable: true },
  status: { class: 'internal', loggable: true },
  statusCode: { class: 'internal', loggable: true },
  durationMs: { class: 'internal', loggable: true },
  errorCode: { class: 'internal', loggable: true },
  errorKind: { class: 'internal', loggable: true },
  errorName: { class: 'internal', loggable: true },
  outcome: { class: 'internal', loggable: true },
  jobId: { class: 'internal', loggable: true },
  jobType: { class: 'internal', loggable: true },
  attemptCount: { class: 'internal', loggable: true },
  // Opaque, tenant-scoped identifiers — Confidential but safe as opaque ids.
  organizationId: { class: 'confidential', loggable: true },
  tenantId: { class: 'confidential', loggable: true },
  documentId: { class: 'confidential', loggable: true },
  signerId: { class: 'confidential', loggable: true },
  sessionId: { class: 'confidential', loggable: true },
  outboxEventId: { class: 'confidential', loggable: true },
  tokenHash: { class: 'confidential', loggable: true },
  clientIp: { class: 'confidential', loggable: true },
  userAgent: { class: 'confidential', loggable: true },
  // Restricted — never loggable.
  password: { class: 'restricted', loggable: false },
  secret: { class: 'restricted', loggable: false },
  token: { class: 'restricted', loggable: false },
  rawToken: { class: 'restricted', loggable: false },
  sessionToken: { class: 'restricted', loggable: false },
  csrfToken: { class: 'restricted', loggable: false },
  authorization: { class: 'restricted', loggable: false },
  cookie: { class: 'restricted', loggable: false },
  signature: { class: 'restricted', loggable: false },
  signaturePng: { class: 'restricted', loggable: false },
  initials: { class: 'restricted', loggable: false },
  points: { class: 'restricted', loggable: false },
  strokes: { class: 'restricted', loggable: false },
  pdfBytes: { class: 'restricted', loggable: false },
  documentBytes: { class: 'restricted', loggable: false },
  documentContent: { class: 'restricted', loggable: false },
  signedUrl: { class: 'restricted', loggable: false },
  presignedUrl: { class: 'restricted', loggable: false },
  storageUrl: { class: 'restricted', loggable: false },
  email: { class: 'confidential', loggable: false },
};

// Explicit header and URL paths, plus a wildcard entry per prohibited field so
// the value is removed at any nesting depth (`*.field`) and at the top level.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.headers.referer',
  'req.headers.referrer',
  'req.headers["x-csrf-token"]',
  'req.query',
  'req.query.token',
  'req.url',
  'req.originalUrl',
  // Prohibited fields at the top level and at nested depths 1-3. fast-redact's
  // `*` matches a single key, so we enumerate a few depths rather than rely on a
  // recursive wildcard (which it does not support). This superset already covers
  // the specific token/secret/signature paths added on main.
  ...PROHIBITED_LOG_FIELDS,
  ...PROHIBITED_LOG_FIELDS.map((field) => `*.${field}`),
  ...PROHIBITED_LOG_FIELDS.map((field) => `*.*.${field}`),
  ...PROHIBITED_LOG_FIELDS.map((field) => `*.*.*.${field}`),
];

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
