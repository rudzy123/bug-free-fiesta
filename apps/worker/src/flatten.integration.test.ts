import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMemoryJobQueueMetrics,
  createOutboxJobProcessor,
  createSilentJobProcessLogger,
} from '@esign/application';
import { createPrismaClient, createPrismaOutboxClaimer } from '@esign/database';
import {
  createBackgroundJob,
  createOutboxEvent,
  createTenantDocumentGraph,
} from '@esign/database/factories';
import { FLATTEN_SIGNATURE_JOB_TYPE } from '@esign/domain';

const runInfraTests = process.env.RUN_INFRA_TESTS === 'true';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://esign:esign_dev_password@localhost:5432/esign';

describe.skipIf(!runInfraTests)('concurrent flatten workers', () => {
  const prisma = createPrismaClient(databaseUrl);

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets only one worker claim a flatten_signature outbox row', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const event = await createOutboxEvent(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      type: FLATTEN_SIGNATURE_JOB_TYPE,
      payload: {
        documentId: graph.document.id,
        signerId: randomUUID(),
        sessionId: randomUUID(),
        revisionId: randomUUID(),
      },
      requestId: randomUUID(),
    });
    await createBackgroundJob(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      outboxEventId: event.id,
      type: FLATTEN_SIGNATURE_JOB_TYPE,
    });
    const claimer = createPrismaOutboxClaimer(prisma);
    const handlerRuns: string[] = [];
    const worker = (owner: string) =>
      createOutboxJobProcessor({
        claimer,
        clock: { nowUtc: () => new Date() },
        random: { next: () => 0 },
        metrics: createMemoryJobQueueMetrics(),
        backoff: { baseDelayMs: 1_000, maxDelayMs: 8_000 },
        leaseMs: 60_000,
        logger: createSilentJobProcessLogger(),
      }).processNext({
        type: FLATTEN_SIGNATURE_JOB_TYPE,
        owner,
        handler: async () => {
          handlerRuns.push(owner);
        },
      });
    const [a, b] = await Promise.all([worker('worker-a'), worker('worker-b')]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(['idle', 'succeeded']);
    expect(handlerRuns).toHaveLength(1);
  });
});
