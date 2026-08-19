import { INSPECT_DOCUMENT_JOB_TYPE, ValidationError } from '@esign/domain';
import type {
  CleanupAbandonedUploads,
  InspectDocument,
  OutboxJobProcessor,
} from '@esign/application';
import { inspectDocumentJobPayloadSchema } from '@esign/contracts';

export async function processDocumentIngestionJobs(input: {
  processor: OutboxJobProcessor;
  inspect: InspectDocument;
  cleanup: CleanupAbandonedUploads;
  workerId: string;
}): Promise<{ inspected: number; abandoned: number }> {
  const abandoned = await input.cleanup();
  const result = await input.processor.processNext({
    type: INSPECT_DOCUMENT_JOB_TYPE,
    owner: input.workerId,
    handler: async (claimed) => {
      const parsed = inspectDocumentJobPayloadSchema.safeParse(claimed.event.payload);
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_payload' });
      }
      await input.inspect({
        organizationId: claimed.event.organizationId,
        documentId: parsed.data.documentId,
        revisionId: parsed.data.revisionId,
        jobId: claimed.job.id,
        outboxEventId: claimed.event.id,
        requestId: claimed.event.requestId,
      });
    },
  });
  return {
    inspected: result.outcome === 'succeeded' ? 1 : 0,
    abandoned: abandoned.abandoned,
  };
}
