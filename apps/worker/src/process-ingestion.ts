import { INSPECT_DOCUMENT_JOB_TYPE, isApplicationError, type Clock } from '@esign/domain';
import type { CleanupAbandonedUploads, InspectDocument } from '@esign/application';
import type { OutboxClaimer } from '@esign/database';
import type { Logger } from '@esign/logger';

export async function processDocumentIngestionJobs(input: {
  claimer: OutboxClaimer;
  inspect: InspectDocument;
  cleanup: CleanupAbandonedUploads;
  clock: Clock;
  logger: Logger;
  workerId: string;
}): Promise<{ inspected: number; abandoned: number }> {
  const abandoned = await input.cleanup();
  let inspected = 0;
  const now = input.clock.nowUtc();
  const event = await input.claimer.claimNextByType({
    type: INSPECT_DOCUMENT_JOB_TYPE,
    now,
    owner: input.workerId,
    leaseUntil: new Date(now.getTime() + 60_000),
  });
  if (!event) {
    return { inspected, abandoned: abandoned.abandoned };
  }
  const documentId = typeof event.payload.documentId === 'string' ? event.payload.documentId : null;
  const revisionId = typeof event.payload.revisionId === 'string' ? event.payload.revisionId : null;
  if (!documentId || !revisionId) {
    await input.claimer.markFailed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      errorCode: 'invalid_payload',
      availableAt: new Date(now.getTime() + 60_000),
    });
    return { inspected, abandoned: abandoned.abandoned };
  }
  try {
    await input.inspect({
      organizationId: event.organizationId,
      documentId,
      revisionId,
      jobId: event.id,
      requestId: event.requestId,
    });
    await input.claimer.markProcessed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      processedAt: input.clock.nowUtc(),
    });
    inspected = 1;
  } catch (error: unknown) {
    const code = isApplicationError(error) ? error.kind : 'inspect_failed';
    input.logger.warn(
      { correlationId: event.requestId, documentId, errorKind: code },
      'document inspection job failed',
    );
    await input.claimer.markFailed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      errorCode: code,
      availableAt: new Date(input.clock.nowUtc().getTime() + 30_000),
    });
  }
  return { inspected, abandoned: abandoned.abandoned };
}
