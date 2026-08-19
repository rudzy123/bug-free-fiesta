import { NOTIFY_SIGNER_JOB_TYPE, ValidationError } from '@esign/domain';
import type { Notifier } from '@esign/domain';
import type { OutboxJobProcessor } from '@esign/application';
import { notifySignerJobPayloadSchema } from '@esign/contracts';

export async function processSignerNotificationJobs(input: {
  processor: OutboxJobProcessor;
  notifier: Notifier;
  workerId: string;
}): Promise<{ notified: number }> {
  const result = await input.processor.processNext({
    type: NOTIFY_SIGNER_JOB_TYPE,
    owner: input.workerId,
    handler: async (claimed) => {
      const parsed = notifySignerJobPayloadSchema.safeParse(claimed.event.payload);
      if (!parsed.success || claimed.event.documentId === null) {
        throw new ValidationError({ reason: 'invalid_payload' });
      }
      await input.notifier.sendSigningInvitation({
        organizationId: claimed.event.organizationId,
        documentId: claimed.event.documentId,
        signerId: parsed.data.signerId,
        sessionId: parsed.data.sessionId,
        to: null,
        expiresAt: claimed.event.availableAt,
        idempotencyKey: claimed.event.id,
      });
    },
  });
  return { notified: result.outcome === 'succeeded' ? 1 : 0 };
}
