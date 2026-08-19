import { FLATTEN_SIGNATURE_JOB_TYPE, ValidationError } from '@esign/domain';
import type { FlattenSignature, OutboxJobProcessor } from '@esign/application';
import { flattenSignatureJobPayloadSchema } from '@esign/contracts';

export async function processSignatureFlattenJobs(input: {
  processor: OutboxJobProcessor;
  flatten: FlattenSignature;
  workerId: string;
}): Promise<{ flattened: number }> {
  const result = await input.processor.processNext({
    type: FLATTEN_SIGNATURE_JOB_TYPE,
    owner: input.workerId,
    handler: async (claimed) => {
      const parsed = flattenSignatureJobPayloadSchema.safeParse(claimed.event.payload);
      if (!parsed.success || claimed.event.documentId === null) {
        throw new ValidationError({ reason: 'invalid_payload' });
      }
      await input.flatten({
        organizationId: claimed.event.organizationId,
        documentId: parsed.data.documentId,
        signerId: parsed.data.signerId,
        sessionId: parsed.data.sessionId,
        revisionId: parsed.data.revisionId,
        jobId: claimed.job.id,
        outboxEventId: claimed.event.id,
        requestId: claimed.event.requestId,
        owner: input.workerId,
      });
    },
  });
  return { flattened: result.outcome === 'succeeded' ? 1 : 0 };
}
