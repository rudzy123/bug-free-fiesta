import { describe, expect, it } from 'vitest';
import { createLogger } from '@esign/logger';
import { processDocumentIngestionJobs } from './process-ingestion.js';
import type { OutboxClaimer } from '@esign/database';
import type { CleanupAbandonedUploads, InspectDocument } from '@esign/application';

describe('document ingestion worker processor', () => {
  it('cleans abandoned uploads and inspects a claimed outbox event', async () => {
    let inspected = 0;
    const claimer: OutboxClaimer = {
      async claimNextByType() {
        return {
          id: '99999999-9999-4999-8999-999999999999',
          organizationId: '11111111-1111-4111-8111-111111111111',
          documentId: '44444444-4444-4444-8444-444444444444',
          type: 'inspect_document',
          status: 'processing',
          payload: {
            documentId: '44444444-4444-4444-8444-444444444444',
            revisionId: '88888888-8888-4888-8888-888888888888',
          },
          requestId: 'req-1',
          attemptCount: 1,
          availableAt: new Date('2026-08-18T12:00:00.000Z'),
          processedAt: null,
          lastErrorCode: null,
          createdAt: new Date('2026-08-18T12:00:00.000Z'),
          updatedAt: new Date('2026-08-18T12:00:00.000Z'),
        };
      },
      async markProcessed() {
        inspected += 1;
      },
      async markFailed() {
        throw new Error('should not fail');
      },
    };
    const inspect: InspectDocument = async () => ({ inspectionStatus: 'accepted' });
    const cleanup: CleanupAbandonedUploads = async () => ({ abandoned: 2 });
    const result = await processDocumentIngestionJobs({
      claimer,
      inspect,
      cleanup,
      clock: { nowUtc: () => new Date('2026-08-18T12:00:00.000Z') },
      logger: createLogger({ name: 'worker-ingest-test', level: 'silent' }),
      workerId: 'test-worker',
    });
    expect(result).toEqual({ inspected: 1, abandoned: 2 });
    expect(inspected).toBe(1);
  });
});
