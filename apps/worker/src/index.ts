import { loadWorkerConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import {
  createPrismaClient,
  createPrismaOutboxClaimer,
  createPrismaPinger,
  createPrismaTenantRepositories,
  createPrismaUnitOfWork,
  createPrismaUploadSessionLookup,
} from '@esign/database';
import {
  createCleanupAbandonedUploads,
  createDocumentInspector,
  createInspectDocument,
  createMemoryObjectStorage,
  createNotifier,
  createSizeLimitedObjectStorage,
  createSystemClock,
  createUuidIdGenerator,
} from '@esign/application';
import { createJobPoller } from './poller.js';
import { createWorkerHealthServer } from './health-server.js';
import { processDocumentIngestionJobs } from './process-ingestion.js';
import { processSignerNotificationJobs } from './process-notifications.js';

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const database = createPrismaPinger(prisma);
  const clock = createSystemClock();
  const ids = createUuidIdGenerator();
  const repos = createPrismaTenantRepositories(prisma);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const storage = createSizeLimitedObjectStorage(
    createMemoryObjectStorage(),
    config.DOCUMENT_MAX_UPLOAD_BYTES,
  );
  const inspect = createInspectDocument({
    documents: repos.documents,
    revisions: repos.revisions,
    storage,
    inspector: createDocumentInspector({
      name: config.DOCUMENT_INSPECTOR,
      nodeEnv: config.NODE_ENV,
    }),
    unitOfWork,
    ids,
    clock,
  });
  const cleanup = createCleanupAbandonedUploads({
    uploadSessions: createPrismaUploadSessionLookup(prisma),
    unitOfWork,
    ids,
    clock,
    limit: 50,
  });
  const notifier = createNotifier({
    name: config.NOTIFICATION_ADAPTER,
    nodeEnv: config.NODE_ENV,
    directory: config.NOTIFICATION_PREVIEW_DIR,
  });
  const claimer = createPrismaOutboxClaimer(prisma);

  const poller = createJobPoller({
    intervalMs: config.WORKER_POLL_INTERVAL_MS,
    logger,
    poll: async () => {
      const ingestion = await processDocumentIngestionJobs({
        claimer,
        inspect,
        cleanup,
        clock,
        logger,
        workerId: 'document-ingestion',
      });
      const notifications = await processSignerNotificationJobs({
        claimer,
        notifier,
        clock,
        logger,
        workerId: 'signer-notifications',
      });
      return { jobsClaimed: ingestion.inspected + ingestion.abandoned + notifications.notified };
    },
  });

  const healthServer = createWorkerHealthServer({
    host: config.WORKER_HEALTH_HOST,
    port: config.WORKER_HEALTH_PORT,
    logger,
    poller,
    database,
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'received shutdown signal');

    const timer = setTimeout(() => {
      logger.error({ timeoutMs: config.SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    void poller
      .stop()
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            healthServer.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      )
      .then(() => prisma.$disconnect())
      .then(() => {
        logger.info('shutdown complete');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error(
          { errorName: error instanceof Error ? error.name : 'unknown' },
          'shutdown failed',
        );
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  healthServer.listen(config.WORKER_HEALTH_PORT, config.WORKER_HEALTH_HOST, () => {
    logger.info(
      { host: config.WORKER_HEALTH_HOST, port: config.WORKER_HEALTH_PORT },
      'worker health listening',
    );
    poller.start();
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown startup error';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
