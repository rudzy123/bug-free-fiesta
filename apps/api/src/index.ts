import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createPrismaClient, createPrismaPinger } from '@esign/database';
import { createHealthService } from './application/health-service.js';
import { createAccountAuthFromPrisma } from './compose-account-auth.js';
import { createApiApp } from './create-app.js';
import { installGracefulShutdown } from './shutdown.js';

async function main(): Promise<void> {
  const config = loadApiConfig();
  const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const health = createHealthService(createPrismaPinger(prisma));
  const app = createApiApp({
    config,
    logger,
    health,
    accountAuthRouter: createAccountAuthFromPrisma({ config, prisma }),
  });

  const server = app.listen(config.API_PORT, config.API_HOST, () => {
    logger.info({ host: config.API_HOST, port: config.API_PORT }, 'api listening');
  });

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
