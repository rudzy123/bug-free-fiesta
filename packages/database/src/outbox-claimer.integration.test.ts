import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxStatus, BackgroundJobStatus } from './generated/client/index.js';
import { createPrismaClient } from './index.js';
import { createPrismaJobPublisher } from './infrastructure/prisma-job-publisher.js';
import {
  createPrismaJobQueueHealth,
  createPrismaOutboxClaimer,
} from './infrastructure/prisma-outbox-claimer.js';
import { createBackgroundJob, createOutboxEvent, createTenantDocumentGraph } from './factories.js';

const runInfraTests = process.env.RUN_INFRA_TESTS === 'true';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://esign:esign_dev_password@localhost:5432/esign';

describe.skipIf(!runInfraTests)('outbox SKIP LOCKED claimer', () => {
  const prisma = createPrismaClient(databaseUrl);

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes outbox and job tracking in one publish', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const publisher = createPrismaJobPublisher(prisma);
    const outboxId = randomUUID();
    const jobId = randomUUID();
    const requestId = randomUUID();
    await publisher.publish({
      id: outboxId,
      jobId,
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      type: 'inspect_document',
      payload: { documentId: graph.document.id, revisionId: randomUUID() },
      requestId,
    });
    const [event, job] = await Promise.all([
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: outboxId } }),
      prisma.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
    ]);
    expect(event.status).toBe(OutboxStatus.pending);
    expect(job.outboxEventId).toBe(outboxId);
    expect(job.requestId).toBe(requestId);
    expect(event.requestId).toBe(requestId);
  });

  it('lets exactly one of two concurrent workers claim a row', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const type = `claim_race_${randomUUID()}`;
    const event = await createOutboxEvent(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      type,
      payload: { documentId: graph.document.id, revisionId: randomUUID() },
    });
    await createBackgroundJob(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      outboxEventId: event.id,
      type,
    });
    const claimerA = createPrismaOutboxClaimer(prisma);
    const claimerB = createPrismaOutboxClaimer(prisma);
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 60_000);
    const [first, second] = await Promise.all([
      claimerA.claimNextByType({ type, now, owner: 'worker-a', leaseUntil }),
      claimerB.claimNextByType({ type, now, owner: 'worker-b', leaseUntil }),
    ]);
    const claimed = [first, second].filter((row) => row !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.event.id).toBe(event.id);
    expect(claimed[0]?.job.outboxEventId).toBe(event.id);
  });

  it('recovers an expired processing lease', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const type = `lease_expiry_${randomUUID()}`;
    const past = new Date(Date.now() - 5_000);
    const event = await createOutboxEvent(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      type,
      status: OutboxStatus.processing,
      payload: { documentId: graph.document.id, revisionId: randomUUID() },
      attemptCount: 1,
      leaseOwner: 'crashed-worker',
      leaseUntil: past,
    });
    await createBackgroundJob(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      outboxEventId: event.id,
      type,
      status: BackgroundJobStatus.leased,
      attemptCount: 1,
      leaseOwner: 'crashed-worker',
      leaseUntil: past,
    });
    const claimer = createPrismaOutboxClaimer(prisma);
    const now = new Date();
    const claimed = await claimer.claimNextByType({
      type,
      now,
      owner: 'worker-b',
      leaseUntil: new Date(now.getTime() + 60_000),
    });
    expect(claimed?.leaseRecovered).toBe(true);
    expect(claimed?.event.leaseOwner).toBe('worker-b');
    expect(claimed?.event.attemptCount).toBe(2);
  });

  it('marks terminal failure as dead-lettered and includes it in queue depth', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const type = `poison_${randomUUID()}`;
    const event = await createOutboxEvent(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      type,
      payload: { documentId: graph.document.id, revisionId: randomUUID() },
    });
    const background = await createBackgroundJob(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      outboxEventId: event.id,
      type,
    });
    const claimer = createPrismaOutboxClaimer(prisma);
    const now = new Date();
    const claimed = await claimer.claimNextByType({
      type,
      now,
      owner: 'worker-a',
      leaseUntil: new Date(now.getTime() + 60_000),
    });
    expect(claimed).not.toBeNull();
    await claimer.markDeadLettered({
      organizationId: graph.organization.id,
      outboxEventId: event.id,
      jobId: background.id,
      owner: 'worker-a',
      errorCategory: 'non_retryable',
      errorCode: 'non_retryable:validation',
      failedAt: now,
    });
    const stored = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    const storedJob = await prisma.backgroundJob.findUniqueOrThrow({
      where: { id: background.id },
    });
    expect(stored.status).toBe(OutboxStatus.failed);
    expect(storedJob.status).toBe(BackgroundJobStatus.failed);
    const health = createPrismaJobQueueHealth(prisma);
    const depth = await health.snapshot(new Date());
    expect(depth.failed).toBeGreaterThanOrEqual(1);
  });
});
