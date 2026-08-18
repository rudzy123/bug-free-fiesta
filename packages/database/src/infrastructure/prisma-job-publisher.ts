import { requireOrganizationId, type JobPublisher } from '@esign/domain';
import { OutboxStatus, Prisma } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import { toDomainOutboxEvent } from './prisma-mappers.js';

export function createPrismaJobPublisher(prisma: PrismaClientOrTx): JobPublisher {
  return {
    async publish(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.outboxEvent.create({
        data: {
          id: input.id,
          organizationId,
          documentId: input.documentId ?? null,
          type: input.type,
          status: OutboxStatus.pending,
          payload: input.payload as Prisma.InputJsonValue,
          requestId: input.requestId ?? null,
          availableAt: input.availableAt ?? new Date(),
        },
      });
      return toDomainOutboxEvent(row);
    },
  };
}
