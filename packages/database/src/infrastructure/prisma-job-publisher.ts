import { randomUUID } from 'node:crypto';
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  assertSafeJobPayload,
  requireOrganizationId,
  type JobPublisher,
} from '@esign/domain';
import { BackgroundJobStatus, OutboxStatus, Prisma } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import { toDomainOutboxEvent } from './prisma-mappers.js';

export function createPrismaJobPublisher(prisma: PrismaClientOrTx): JobPublisher {
  return {
    async publish(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      assertSafeJobPayload(input.payload);
      const availableAt = input.availableAt ?? new Date();
      const row = await prisma.outboxEvent.create({
        data: {
          id: input.id,
          organizationId,
          documentId: input.documentId ?? null,
          type: input.type,
          status: OutboxStatus.pending,
          payload: input.payload as Prisma.InputJsonValue,
          requestId: input.requestId ?? null,
          availableAt,
          backgroundJobs: {
            create: {
              id: input.jobId ?? randomUUID(),
              organizationId,
              documentId: input.documentId ?? null,
              type: input.type,
              status: BackgroundJobStatus.pending,
              maxAttempts: input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
              requestId: input.requestId ?? null,
              availableAt,
            },
          },
        },
      });
      return toDomainOutboxEvent(row);
    },
  };
}
