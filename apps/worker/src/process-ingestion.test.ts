import { describe, expect, it } from 'vitest';
import { createOutboxJobProcessor, createSilentJobProcessLogger } from '@esign/application';
import type { OutboxClaimer } from '@esign/domain';
import { processDocumentIngestionJobs } from './process-ingestion.js';
import type { CleanupAbandonedUploads, InspectDocument } from '@esign/application';

describe('document ingestion worker processor', () => {
  it('cleans abandoned uploads and inspects a claimed outbox event', async () => {
    let inspected = 0;
    const claimer: OutboxClaimer = {
      async claimNextByType() {
        return {
          event: {
            id: '99999999-9999-4999-8999-999999999999',
            organizationId: '11111111-1111-4111-8111-111111111111',
            documentId: '44444444-4444-4444-8444-444444444444',
            type: 'inspect_document',
            status: 'processing',
            payload: {
              documentId: '44444444-4444-4444-8444-444444444444',
              revisionId: '88888888-8888-4888-8888-888888888888',
            },
            requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            attemptCount: 1,
            leaseOwner: 'test-worker',
            leaseUntil: new Date('2026-08-18T12:01:00.000Z'),
            availableAt: new Date('2026-08-18T12:00:00.000Z'),
            processedAt: null,
            lastErrorCode: null,
            createdAt: new Date('2026-08-18T12:00:00.000Z'),
            updatedAt: new Date('2026-08-18T12:00:00.000Z'),
          },
          job: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            organizationId: '11111111-1111-4111-8111-111111111111',
            documentId: '44444444-4444-4444-8444-444444444444',
            outboxEventId: '99999999-9999-4999-8999-999999999999',
            type: 'inspect_document',
            status: 'leased',
            attemptCount: 1,
            maxAttempts: 8,
            leaseOwner: 'test-worker',
            leaseUntil: new Date('2026-08-18T12:01:00.000Z'),
            availableAt: new Date('2026-08-18T12:00:00.000Z'),
            lastErrorCode: null,
            requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            version: 2,
            createdAt: new Date('2026-08-18T12:00:00.000Z'),
            updatedAt: new Date('2026-08-18T12:00:00.000Z'),
          },
          leaseRecovered: false,
        };
      },
      async markProcessed() {
        inspected += 1;
      },
      async scheduleRetry() {
        throw new Error('should not retry');
      },
      async markDeadLettered() {
        throw new Error('should not fail');
      },
    };
    const processor = createOutboxJobProcessor({
      claimer,
      clock: { nowUtc: () => new Date('2026-08-18T12:00:00.000Z') },
      random: { next: () => 0 },
      metrics: {
        recordQueueDepth() {
          return;
        },
        recordClaim() {
          return;
        },
        recordAttempt() {
          return;
        },
        recordSuccess() {
          return;
        },
        recordFailure() {
          return;
        },
        recordLease() {
          return;
        },
        snapshot() {
          return {
            pending: 0,
            processing: 0,
            failed: 0,
            expiredLeaseCount: 0,
            claims: 0,
            recoveredLeases: 0,
            attempts: 0,
            successes: 0,
            retryableFailures: 0,
            terminalFailures: 0,
            lastLatencyMs: null,
          };
        },
      },
      backoff: { baseDelayMs: 1_000, maxDelayMs: 8_000 },
      leaseMs: 60_000,
      logger: createSilentJobProcessLogger(),
    });
    const inspect: InspectDocument = async () => ({ inspectionStatus: 'accepted' });
    const cleanup: CleanupAbandonedUploads = async () => ({ abandoned: 2 });
    const result = await processDocumentIngestionJobs({
      processor,
      inspect,
      cleanup,
      workerId: 'test-worker',
    });
    expect(result).toEqual({ inspected: 1, abandoned: 2 });
    expect(inspected).toBe(1);
  });
});
