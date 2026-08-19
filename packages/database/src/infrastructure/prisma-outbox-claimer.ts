import { randomUUID } from 'node:crypto';
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  type ClaimedOutboxWork,
  type JobQueueDepth,
  type JobQueueHealth,
  type OutboxClaimer,
} from '@esign/domain';
import { BackgroundJobStatus, OutboxStatus } from '../generated/client/index.js';
import type { PrismaClient } from '../generated/client/index.js';
import { toDomainBackgroundJob, toDomainOutboxEvent } from './prisma-mappers.js';

/**
 * Claims outbox rows with PostgreSQL `FOR UPDATE SKIP LOCKED`.
 * Values are bound through Prisma's tagged-template parameters (not string-concatenated SQL).
 */
export function createPrismaOutboxClaimer(prisma: PrismaClient): OutboxClaimer {
  return {
    async claimNextByType(input) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; organizationId: string; previousStatus: string }>
        >`
          WITH picked AS (
            SELECT id, status
            FROM "outbox_events"
            WHERE type = ${input.type}
              AND "availableAt" <= ${input.now}
              AND (
                status = 'pending'::"outbox_status"
                OR (
                  status = 'processing'::"outbox_status"
                  AND "leaseUntil" IS NOT NULL
                  AND "leaseUntil" < ${input.now}
                )
              )
            ORDER BY "availableAt" ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          ),
          updated AS (
            UPDATE "outbox_events" AS o
            SET
              status = 'processing'::"outbox_status",
              "leaseOwner" = ${input.owner},
              "leaseUntil" = ${input.leaseUntil},
              "attemptCount" = o."attemptCount" + 1
            FROM picked
            WHERE o.id = picked.id
            RETURNING o.id, o."organizationId", picked.status AS "previousStatus"
          )
          SELECT id, "organizationId", "previousStatus" FROM updated
        `;
        const claimed = rows[0];
        if (!claimed) {
          return null;
        }
        const eventRow = await tx.outboxEvent.findFirst({
          where: { organizationId: claimed.organizationId, id: claimed.id },
        });
        if (!eventRow) {
          return null;
        }
        const existingJob = await tx.backgroundJob.findFirst({
          where: { organizationId: eventRow.organizationId, outboxEventId: eventRow.id },
        });
        if (existingJob) {
          await tx.backgroundJob.updateMany({
            where: { organizationId: eventRow.organizationId, id: existingJob.id },
            data: {
              status: BackgroundJobStatus.leased,
              leaseOwner: input.owner,
              leaseUntil: input.leaseUntil,
              attemptCount: { increment: 1 },
              version: { increment: 1 },
            },
          });
        } else {
          await tx.backgroundJob.create({
            data: {
              id: randomUUID(),
              organizationId: eventRow.organizationId,
              documentId: eventRow.documentId,
              outboxEventId: eventRow.id,
              type: eventRow.type,
              status: BackgroundJobStatus.leased,
              attemptCount: eventRow.attemptCount,
              maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
              leaseOwner: input.owner,
              leaseUntil: input.leaseUntil,
              availableAt: eventRow.availableAt,
              requestId: eventRow.requestId,
            },
          });
        }
        const jobRow = await tx.backgroundJob.findFirst({
          where: { organizationId: eventRow.organizationId, outboxEventId: eventRow.id },
        });
        if (!jobRow) {
          return null;
        }
        const claimedWork: ClaimedOutboxWork = {
          event: toDomainOutboxEvent(eventRow),
          job: toDomainBackgroundJob(jobRow),
          leaseRecovered: claimed.previousStatus === 'processing',
        };
        return claimedWork;
      });
    },
    async markProcessed(input) {
      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.updateMany({
          where: {
            id: input.outboxEventId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: OutboxStatus.processing,
          },
          data: {
            status: OutboxStatus.processed,
            processedAt: input.processedAt,
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        await tx.backgroundJob.updateMany({
          where: {
            id: input.jobId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: BackgroundJobStatus.leased,
          },
          data: {
            status: BackgroundJobStatus.succeeded,
            leaseOwner: null,
            leaseUntil: null,
            version: { increment: 1 },
          },
        });
      });
    },
    async scheduleRetry(input) {
      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.updateMany({
          where: {
            id: input.outboxEventId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: OutboxStatus.processing,
          },
          data: {
            status: OutboxStatus.pending,
            lastErrorCode: input.errorCode,
            availableAt: input.availableAt,
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        await tx.backgroundJob.updateMany({
          where: {
            id: input.jobId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: BackgroundJobStatus.leased,
          },
          data: {
            status: BackgroundJobStatus.pending,
            lastErrorCode: input.errorCode,
            availableAt: input.availableAt,
            leaseOwner: null,
            leaseUntil: null,
            version: { increment: 1 },
          },
        });
      });
    },
    async markDeadLettered(input) {
      await prisma.$transaction(async (tx) => {
        await tx.outboxEvent.updateMany({
          where: {
            id: input.outboxEventId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: OutboxStatus.processing,
          },
          data: {
            status: OutboxStatus.failed,
            lastErrorCode: input.errorCode,
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        await tx.backgroundJob.updateMany({
          where: {
            id: input.jobId,
            organizationId: input.organizationId,
            leaseOwner: input.owner,
            status: BackgroundJobStatus.leased,
          },
          data: {
            status: BackgroundJobStatus.failed,
            lastErrorCode: input.errorCode,
            leaseOwner: null,
            leaseUntil: null,
            version: { increment: 1 },
          },
        });
      });
    },
  };
}

export function createPrismaJobQueueHealth(prisma: PrismaClient): JobQueueHealth {
  return {
    async snapshot(now: Date): Promise<JobQueueDepth> {
      const [pending, processing, failed, expiredLeaseCount, oldest] = await Promise.all([
        prisma.outboxEvent.count({
          where: { status: OutboxStatus.pending, availableAt: { lte: now } },
        }),
        prisma.outboxEvent.count({
          where: { status: OutboxStatus.processing },
        }),
        prisma.outboxEvent.count({
          where: { status: OutboxStatus.failed },
        }),
        prisma.outboxEvent.count({
          where: { status: OutboxStatus.processing, leaseUntil: { lt: now } },
        }),
        prisma.outboxEvent.findFirst({
          where: {
            OR: [
              { status: OutboxStatus.pending, availableAt: { lte: now } },
              { status: OutboxStatus.processing, leaseUntil: { lt: now } },
            ],
          },
          orderBy: { availableAt: 'asc' },
          select: { availableAt: true },
        }),
      ]);
      return {
        pending,
        processing,
        failed,
        expiredLeaseCount,
        oldestAvailableAt: oldest?.availableAt ?? null,
      };
    },
  };
}
