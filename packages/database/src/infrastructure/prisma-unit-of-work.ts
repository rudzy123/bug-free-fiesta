import type { UnitOfWork } from '@esign/domain';
import type { PrismaClient } from '../generated/client/index.js';
import { createPrismaAuditWriter } from './prisma-audit-writer.js';
import { createPrismaJobPublisher } from './prisma-job-publisher.js';
import { createPrismaTenantRepositories } from './prisma-tenant-repositories.js';

export function createPrismaUnitOfWork(client: PrismaClient): UnitOfWork {
  return {
    async run(work) {
      return client.$transaction(async (tx) => {
        const repositories = createPrismaTenantRepositories(tx);
        return work({
          ...repositories,
          audit: createPrismaAuditWriter(tx),
          jobs: createPrismaJobPublisher(tx),
        });
      });
    },
  };
}
