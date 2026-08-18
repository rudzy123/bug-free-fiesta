import { NOTIFY_SIGNER_JOB_TYPE, isApplicationError, type Clock } from '@esign/domain';
import type { Notifier } from '@esign/domain';
import type { OutboxClaimer } from '@esign/database';
import type { Logger } from '@esign/logger';

export async function processSignerNotificationJobs(input: {
  claimer: OutboxClaimer;
  notifier: Notifier;
  clock: Clock;
  logger: Logger;
  workerId: string;
}): Promise<{ notified: number }> {
  const now = input.clock.nowUtc();
  const event = await input.claimer.claimNextByType({
    type: NOTIFY_SIGNER_JOB_TYPE,
    now,
    owner: input.workerId,
    leaseUntil: new Date(now.getTime() + 60_000),
  });
  if (!event) {
    return { notified: 0 };
  }
  const signerId = typeof event.payload.signerId === 'string' ? event.payload.signerId : null;
  const sessionId = typeof event.payload.sessionId === 'string' ? event.payload.sessionId : null;
  if (!signerId || !sessionId || event.documentId === null) {
    await input.claimer.markFailed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      errorCode: 'invalid_payload',
      availableAt: new Date(now.getTime() + 60_000),
    });
    return { notified: 0 };
  }
  try {
    await input.notifier.sendSigningInvitation({
      organizationId: event.organizationId,
      documentId: event.documentId,
      signerId,
      sessionId,
      to: null,
      expiresAt: now,
    });
    await input.claimer.markProcessed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      processedAt: input.clock.nowUtc(),
    });
    return { notified: 1 };
  } catch (error: unknown) {
    const code = isApplicationError(error) ? error.kind : 'notify_failed';
    input.logger.warn(
      { correlationId: event.requestId, documentId: event.documentId, errorKind: code },
      'signing invitation job failed',
    );
    await input.claimer.markFailed({
      organizationId: event.organizationId,
      outboxEventId: event.id,
      errorCode: code,
      availableAt: new Date(input.clock.nowUtc().getTime() + 30_000),
    });
    return { notified: 0 };
  }
}
