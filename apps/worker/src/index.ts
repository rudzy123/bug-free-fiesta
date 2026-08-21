import { loadWorkerConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createObservabilityMetrics } from '@esign/observability';
import {
  createPrismaClient,
  createPrismaJobQueueHealth,
  createPrismaOutboxClaimer,
  createPrismaPinger,
  createPrismaTenantRepositories,
  createPrismaUnitOfWork,
  createPrismaUploadSessionLookup,
} from '@esign/database';
import {
  createCleanupAbandonedUploads,
  createCleanupOrphanedObjects,
  createDocumentInspector,
  createFlattenSignature,
  createInspectDocument,
  createMemoryJobQueueMetrics,
  createObjectStorageDriver,
  createNotifier,
  createOutboxJobProcessor,
  createSha256Hashing,
  createSizeLimitedObjectStorage,
  createSystemClock,
  createSystemUnitIntervalRandom,
  createUuidIdGenerator,
  PNG_MAX_BYTES,
} from '@esign/application';
import { createJobPoller } from './poller.js';
import { createWorkerHealthServer } from './health-server.js';
import { withObservability } from './observability-metrics.js';
import { processDocumentIngestionJobs } from './process-ingestion.js';
import { processSignerNotificationJobs } from './process-notifications.js';
import { processSignatureFlattenJobs } from './process-finalization.js';
import { createPdfLibFlattener } from './pdf-lib-flattener.js';

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const database = createPrismaPinger(prisma);
  const clock = createSystemClock();
  const ids = createUuidIdGenerator();
  const workerId = ids.next();
  const repos = createPrismaTenantRepositories(prisma);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const storage = createSizeLimitedObjectStorage(
    createObjectStorageDriver({
      driver: config.OBJECT_STORAGE_DRIVER,
      fsRoot: config.OBJECT_STORAGE_FS_ROOT,
    }),
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
  const flatten = createFlattenSignature({
    documents: repos.documents,
    revisions: repos.revisions,
    signers: repos.signers,
    sessions: repos.signingSessions,
    fields: repos.signatureFields,
    consent: repos.consentRecords,
    artifacts: repos.finalizedArtifacts,
    storage,
    flattener: createPdfLibFlattener(),
    hashing: createSha256Hashing(),
    unitOfWork,
    ids,
    clock,
    leaseMs: config.WORKER_LEASE_MS,
    timeoutMs: config.WORKER_PDF_TIMEOUT_MS,
    maxPdfBytes: config.DOCUMENT_MAX_UPLOAD_BYTES,
    maxPngBytes: PNG_MAX_BYTES,
  });
  const cleanup = createCleanupAbandonedUploads({
    uploadSessions: createPrismaUploadSessionLookup(prisma),
    unitOfWork,
    ids,
    clock,
    limit: 50,
  });
  const cleanupOrphans = createCleanupOrphanedObjects({
    storage,
    unitOfWork,
    clock,
    olderThanMs: config.WORKER_ORPHAN_OBJECT_TTL_MS,
  });
  const notifier = createNotifier({
    name: config.NOTIFICATION_ADAPTER,
    nodeEnv: config.NODE_ENV,
    directory: config.NOTIFICATION_PREVIEW_DIR,
  });
  const claimer = createPrismaOutboxClaimer(prisma);
  const observability = createObservabilityMetrics();
  const metrics = withObservability(createMemoryJobQueueMetrics(), observability);
  const queueHealth = createPrismaJobQueueHealth(prisma);
  let acceptingWork = true;
  const processor = createOutboxJobProcessor({
    claimer,
    clock,
    random: createSystemUnitIntervalRandom(),
    metrics,
    backoff: {
      baseDelayMs: config.WORKER_BACKOFF_BASE_MS,
      maxDelayMs: config.WORKER_BACKOFF_MAX_MS,
    },
    leaseMs: config.WORKER_LEASE_MS,
    logger: {
      info: (fields, message) => logger.info(fields, message),
      warn: (fields, message) => logger.warn(fields, message),
      error: (fields, message) => logger.error(fields, message),
    },
    shouldStop: () => !acceptingWork,
  });

  const poller = createJobPoller({
    intervalMs: config.WORKER_POLL_INTERVAL_MS,
    logger,
    poll: async () => {
      const ingestion = await processDocumentIngestionJobs({
        processor,
        inspect,
        cleanup,
        workerId,
      });
      const notifications = await processSignerNotificationJobs({
        processor,
        notifier,
        workerId,
      });
      const flattening = await processSignatureFlattenJobs({
        processor,
        flatten,
        workerId,
      });
      const organizations = await prisma.organization.findMany({
        select: { id: true },
        take: 25,
        orderBy: { id: 'asc' },
      });
      let orphansDeleted = 0;
      for (const organization of organizations) {
        const result = await cleanupOrphans({ organizationId: organization.id });
        orphansDeleted += result.deleted;
      }
      // Refresh the queue-depth gauge once per poll so /metrics scrapes stay
      // fresh without a database call on the scrape path.
      metrics.recordQueueDepth(await queueHealth.snapshot(clock.nowUtc()));
      return {
        jobsClaimed:
          ingestion.inspected +
          ingestion.abandoned +
          notifications.notified +
          flattening.flattened +
          orphansDeleted,
      };
    },
  });

  const healthServer = createWorkerHealthServer({
    host: config.WORKER_HEALTH_HOST,
    port: config.WORKER_HEALTH_PORT,
    logger,
    poller,
    database,
    queueHealth,
    metrics,
    observability,
    clock,
    staleAfterMs: config.WORKER_STALE_QUEUE_MS,
    pollStaleAfterMs: config.WORKER_POLL_INTERVAL_MS * 3,
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    acceptingWork = false;
    logger.info({ signal, workerId }, 'received shutdown signal');

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
        logger.info({ workerId }, 'shutdown complete');
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
      {
        host: config.WORKER_HEALTH_HOST,
        port: config.WORKER_HEALTH_PORT,
        workerId,
      },
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
