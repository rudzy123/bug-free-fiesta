import type { Server } from 'node:http';
import type { Logger } from '@esign/logger';
import type { PrismaClient } from '@esign/database';

export async function installGracefulShutdown(options: {
  server: Server;
  prisma: PrismaClient;
  logger: Logger;
  timeoutMs: number;
}): Promise<void> {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    options.logger.info({ signal }, 'received shutdown signal');

    const timer = setTimeout(() => {
      options.logger.error({ timeoutMs: options.timeoutMs }, 'shutdown timed out');
      process.exit(1);
    }, options.timeoutMs);
    timer.unref();

    options.server.close((closeError) => {
      void options.prisma
        .$disconnect()
        .catch((disconnectError: unknown) => {
          options.logger.error(
            {
              errorName: disconnectError instanceof Error ? disconnectError.name : 'unknown',
            },
            'prisma disconnect failed',
          );
        })
        .finally(() => {
          if (closeError) {
            options.logger.error({ errorName: closeError.name }, 'http server close failed');
            process.exit(1);
          }
          options.logger.info('shutdown complete');
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
