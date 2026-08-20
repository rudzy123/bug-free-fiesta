import express, { type Express, type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { ApiConfig } from '@esign/config';
import type { Logger } from '@esign/logger';
import {
  createNoopTracer,
  createObservabilityMetrics,
  type ObservabilityMetrics,
  type Tracer,
} from '@esign/observability';
import type { HealthService } from './application/health-service.js';
import { createRequestIdMiddleware } from './http/middleware/request-id.js';
import { createHttpMetrics } from './http/middleware/http-metrics.js';
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

export function createApiApp(options: CreateApiAppOptions): Express {
  const metrics = options.metrics ?? createObservabilityMetrics();
  const tracer = options.tracer ?? createNoopTracer();

  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      referrerPolicy: { policy: 'no-referrer' },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
    }),
  );
  app.use(createRequestIdMiddleware(options.config.CORRELATION_ID_HEADER));
  app.use(createHttpMetrics(metrics, tracer));
  app.use(
    cors({
      origin: [...options.config.CORS_ORIGINS],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: options.config.JSON_BODY_LIMIT }));
  app.use(createCookieParser());
  app.use(createHttpLogger(options.logger));
  app.use(createHealthRouter(options.health, metrics));
  app.use(createMetricsRouter(metrics));

  if (options.accountAuthRouter) {
    app.use(options.accountAuthRouter);
  }

  if (options.documentRouter) {
    app.use(options.documentRouter);
  }

  options.extraRoutes?.(app);

  app.use(notFoundHandler());
  app.use(createErrorHandler(options.logger, metrics));

  return app;
}
