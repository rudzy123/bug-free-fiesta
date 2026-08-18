import type { OutboxEvent, PreviewGrantLookup, UploadSessionLookup } from '@esign/domain';
import { OutboxStatus, UploadSessionStatus } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  toDomainOutboxEvent,
  toDomainPreviewGrant,
  toDomainUploadSession,
} from './prisma-mappers.js';

export function createPrismaUploadSessionLookup(prisma: PrismaClientOrTx): UploadSessionLookup {
  return {
    async findByTokenHash(tokenHash: string) {
      const row = await prisma.uploadSession.findUnique({ where: { tokenHash } });
      return row ? toDomainUploadSession(row) : null;
    },
    async listExpiredIssued(input) {
      const rows = await prisma.uploadSession.findMany({
        where: {
          status: UploadSessionStatus.issued,
          expiresAt: { lte: input.now },
        },
        orderBy: { expiresAt: 'asc' },
        take: input.limit,
      });
      return rows.map(toDomainUploadSession);
    },
  };
}

export function createPrismaPreviewGrantLookup(prisma: PrismaClientOrTx): PreviewGrantLookup {
  return {
    async findByTokenHash(tokenHash: string) {
      const row = await prisma.previewGrant.findUnique({ where: { tokenHash } });
      return row ? toDomainPreviewGrant(row) : null;
    },
  };
}

export type OutboxClaimer = {
  claimNextByType: (input: {
    type: string;
    now: Date;
    owner: string;
    leaseUntil: Date;
  }) => Promise<OutboxEvent | null>;
  markProcessed: (input: {
    organizationId: string;
    outboxEventId: string;
    processedAt: Date;
  }) => Promise<void>;
  markFailed: (input: {
    organizationId: string;
    outboxEventId: string;
    errorCode: string;
    availableAt: Date;
  }) => Promise<void>;
};

export function createPrismaOutboxClaimer(prisma: PrismaClientOrTx): OutboxClaimer {
  return {
    async claimNextByType(input) {
      const candidate = await prisma.outboxEvent.findFirst({
        where: {
          type: input.type,
          status: OutboxStatus.pending,
          availableAt: { lte: input.now },
        },
        orderBy: { availableAt: 'asc' },
      });
      if (!candidate) {
        return null;
      }
      const claimed = await prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organizationId,
          status: OutboxStatus.pending,
        },
        data: {
          status: OutboxStatus.processing,
          leaseOwner: input.owner,
          leaseUntil: input.leaseUntil,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        return null;
      }
      const row = await prisma.outboxEvent.findFirst({
        where: { organizationId: candidate.organizationId, id: candidate.id },
      });
      return row ? toDomainOutboxEvent(row) : null;
    },
    async markProcessed(input) {
      await prisma.outboxEvent.updateMany({
        where: { id: input.outboxEventId, organizationId: input.organizationId },
        data: { status: OutboxStatus.processed, processedAt: input.processedAt },
      });
    },
    async markFailed(input) {
      await prisma.outboxEvent.updateMany({
        where: { id: input.outboxEventId, organizationId: input.organizationId },
        data: {
          status: OutboxStatus.pending,
          lastErrorCode: input.errorCode,
          availableAt: input.availableAt,
        },
      });
    },
  };
}
