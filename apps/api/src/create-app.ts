import express, { type Express, type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { ApiConfig } from '@esign/config';
import type { Logger } from '@esign/logger';
import { createMemoryRateLimiter, createSystemClock } from '@esign/application';
import {
  createNoopTracer,
  createObservabilityMetrics,
  type ObservabilityMetrics,
  type Tracer,
} from '@esign/observability';
import type { HealthService } from './application/health-service.js';
import { createRequestIdMiddleware } from './http/middleware/request-id.js';
import { createClientIpMiddleware } from './http/client-ip.js';
import { createHttpMetrics } from './http/middleware/http-metrics.js';
import { createRequestTimeout } from './http/middleware/request-timeout.js';
import { createNoParameterPollution } from './http/middleware/no-parameter-pollution.js';
import { createStrictContentType } from './http/middleware/strict-content-type.js';
import { createOverloadGuard } from './http/middleware/overload.js';
import { createIpRateLimit } from './http/middleware/rate-limit.js';
import { createCookieParser } from './http/middleware/cookies.js';
import { createHttpLogger } from './http/middleware/http-logger.js';
import { createErrorHandler } from './http/middleware/error-handler.js';
import { notFoundHandler } from './http/middleware/not-found.js';
import { createHealthRouter } from './http/routes/health.js';
import { createMetricsRouter } from './http/routes/metrics.js';

export type CreateApiAppOptions = {
  config: ApiConfig;
  logger: Logger;
  health: HealthService;
  metrics?: ObservabilityMetrics;
  tracer?: Tracer;
  extraRoutes?: (app: Express) => void;
  accountAuthRouter?: Router;
  documentRouter?: Router;
};

/** Media types the API accepts in request bodies. Everything else is a 415. */
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/pdf',
  'application/octet-stream',
] as const;

export function createApiApp(options: CreateApiAppOptions): Express {
  const { config, logger } = options;
  const metrics = options.metrics ?? createObservabilityMetrics();
  const tracer = options.tracer ?? createNoopTracer();

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');

  // Precise trusted-proxy topology (a hop count, never `true`) so req.ip and
  // the resolved client IP reflect the real edge, not forged headers.
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      referrerPolicy: { policy: 'no-referrer' },
      // The API returns JSON only; lock the document context down entirely.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // API responses must never be framed.
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      // HSTS only in production; sending it over plaintext dev HTTP is useless
      // and can wedge local browsers onto https for localhost.
      strictTransportSecurity:
        config.NODE_ENV === 'production'
          ? { maxAge: 63_072_000, includeSubDomains: true, preload: false }
          : false,
    }),
  );

  app.use(createRequestIdMiddleware(config.CORRELATION_ID_HEADER));
  app.use(createClientIpMiddleware(config.TRUST_PROXY));
  // Metrics/tracing wrap the request as early as possible so latency and status
  // are captured even for requests shed by the timeout, overload, or rate-limit
  // guards below.
  app.use(createHttpMetrics(metrics, tracer));
  app.use(createRequestTimeout(config.API_REQUEST_TIMEOUT_MS, logger));

  app.use(
    cors({
      origin: [...config.CORS_ORIGINS],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        config.CORRELATION_ID_HEADER,
        config.AUTH_CSRF_HEADER_NAME,
        config.DOCUMENT_UPLOAD_TOKEN_HEADER,
        config.DOCUMENT_PREVIEW_TOKEN_HEADER,
        'idempotency-key',
      ],
      maxAge: 600,
    }),
  );

  app.use(createNoParameterPollution());
  app.use(createStrictContentType(ALLOWED_CONTENT_TYPES));
  app.use(createCookieParser());
  app.use(createHttpLogger(logger));

  // Liveness/readiness and the metrics scrape are mounted before overload and
  // rate limiting so probes and scrapes stay reliable while the API sheds load.
  app.use(createHealthRouter(options.health, metrics));
  app.use(
    createMetricsRouter(metrics, {
      bearerToken: config.METRICS_BEARER_TOKEN,
    }),
  );

  app.use(createOverloadGuard({ maxConcurrentRequests: config.API_MAX_CONCURRENT_REQUESTS }));

  const clock = createSystemClock();
  const apiRateLimit = createIpRateLimit(
    createMemoryRateLimiter({
      max: config.API_RATE_LIMIT_MAX,
      windowMs: config.API_RATE_LIMIT_WINDOW_MS,
      clock,
    }),
    'api',
  );
  app.use(apiRateLimit);

  if (options.accountAuthRouter) {
    app.use(options.accountAuthRouter);
  }

  if (options.documentRouter) {
    app.use(options.documentRouter);
  }

  options.extraRoutes?.(app);

  app.use(notFoundHandler());
  app.use(createErrorHandler(logger, metrics));

  return app;
}
