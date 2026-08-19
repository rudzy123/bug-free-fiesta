import { describe, expect, it } from 'vitest';
import { createOutboxJobProcessor, createSilentJobProcessLogger } from '@esign/application';
import type { OutboxClaimer } from '@esign/domain';
import type { FlattenSignature } from '@esign/application';
import { processSignatureFlattenJobs } from './process-finalization.js';

describe('signature flatten worker processor', () => {
  it('parses opaque payload ids and invokes flatten', async () => {
    let flattened = 0;
    const claimer: OutboxClaimer = {
      async claimNextByType() {
        return {
          event: {
            id: '99999999-9999-4999-8999-999999999999',
            organizationId: '11111111-1111-4111-8111-111111111111',
            documentId: '44444444-4444-4444-8444-444444444444',
            type: 'flatten_signature',
            status: 'processing',
            payload: {
              documentId: '44444444-4444-4444-8444-444444444444',
              signerId: '55555555-5555-4555-8555-555555555555',
              sessionId: '66666666-6666-4666-8666-666666666666',
              revisionId: '88888888-8888-4888-8888-888888888888',
            },
            requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            attemptCount: 1,
            leaseOwner: 'test-worker',
            leaseUntil: new Date('2026-08-19T12:01:00.000Z'),
            availableAt: new Date('2026-08-19T12:00:00.000Z'),
            processedAt: null,
            lastErrorCode: null,
            createdAt: new Date('2026-08-19T12:00:00.000Z'),
            updatedAt: new Date('2026-08-19T12:00:00.000Z'),
          },
          job: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            organizationId: '11111111-1111-4111-8111-111111111111',
            documentId: '44444444-4444-4444-8444-444444444444',
            outboxEventId: '99999999-9999-4999-8999-999999999999',
            type: 'flatten_signature',
            status: 'leased',
            attemptCount: 1,
            maxAttempts: 8,
            leaseOwner: 'test-worker',
            leaseUntil: new Date('2026-08-19T12:01:00.000Z'),
            availableAt: new Date('2026-08-19T12:00:00.000Z'),
            lastErrorCode: null,
            requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            version: 2,
            createdAt: new Date('2026-08-19T12:00:00.000Z'),
            updatedAt: new Date('2026-08-19T12:00:00.000Z'),
          },
          leaseRecovered: false,
        };
      },
      async markProcessed() {
        flattened += 1;
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
      clock: { nowUtc: () => new Date('2026-08-19T12:00:00.000Z') },
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
    const flatten: FlattenSignature = async () => ({
      status: 'finalized',
      sha256Digest: 'a'.repeat(64),
    });
    const result = await processSignatureFlattenJobs({
      processor,
      flatten,
      workerId: 'test-worker',
    });
    expect(result).toEqual({ flattened: 1 });
    expect(flattened).toBe(1);
  });
});
