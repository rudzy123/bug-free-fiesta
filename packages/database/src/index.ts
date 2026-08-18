import { PrismaClient } from './generated/client/index.js';

export type { PrismaClient };

export type DatabasePinger = {
  ping: () => Promise<void>;
};

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export function createPrismaPinger(client: PrismaClient): DatabasePinger {
  return {
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
