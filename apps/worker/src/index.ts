import { loadWorkerConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createPrismaClient, createPrismaPinger } from '@esign/database';
import { createJobPoller } from './poller.js';
import { createWorkerHealthServer } from './health-server.js';

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const database = createPrismaPinger(prisma);

  const poller = createJobPoller({
    intervalMs: config.WORKER_POLL_INTERVAL_MS,
    logger,
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
