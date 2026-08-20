import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createLoggingTracer, createObservabilityMetrics } from '@esign/observability';
import { createPrismaClient, createPrismaPinger } from '@esign/database';
import { createHealthService } from './application/health-service.js';
import { createAccountAuthFromPrisma } from './compose-account-auth.js';
import { createDocumentIngestionFromPrisma } from './compose-documents.js';
import { createApiApp } from './create-app.js';
import { installGracefulShutdown } from './shutdown.js';

async function main(): Promise<void> {
  const config = loadApiConfig();
  const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
  const metrics = createObservabilityMetrics();
  const tracer = createLoggingTracer({
    debug: (fields, message) => logger.debug(fields, message),
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const health = createHealthService(createPrismaPinger(prisma));
  const accountAuth = createAccountAuthFromPrisma({ config, prisma });
  const documents = createDocumentIngestionFromPrisma({
    config,
    prisma,
    resolveSession: accountAuth.resolveSession,
    resolveActor: accountAuth.resolveActor,
    hasher: accountAuth.hasher,
  });
  const app = createApiApp({
    config,
    logger,
    health,
    metrics,
    tracer,
    accountAuthRouter: accountAuth.router,
    documentRouter: documents.router,
  });

  const server = app.listen(config.API_PORT, config.API_HOST, () => {
    logger.info({ host: config.API_HOST, port: config.API_PORT }, 'api listening');
  });

  // Node HTTP server-level bounds complement the per-request timeout middleware:
  // cap how long headers and full requests may take, and keep-alive idle time,
  // so slow-loris style connections cannot pin sockets indefinitely.
  server.requestTimeout = config.API_REQUEST_TIMEOUT_MS + 5_000;
  server.headersTimeout = Math.min(config.API_REQUEST_TIMEOUT_MS, 15_000);
  server.keepAliveTimeout = 5_000;

  await installGracefulShutdown({
    server,
    prisma,
    logger,
    timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown startup error';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
