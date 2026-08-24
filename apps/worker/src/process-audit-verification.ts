import {
  createRunScheduledAuditVerification,
  shouldRunScheduledAuditVerification,
  type RunScheduledAuditVerification,
} from '@esign/application';
import { VERIFY_AUDIT_CHAINS_JOB_TYPE } from '@esign/domain';

export function createScheduledAuditVerificationPoll(input: {
  run: RunScheduledAuditVerification;
  intervalMs: number;
  now: () => Date;
}): () => Promise<{ jobsClaimed: number }> {
  let lastRunAt: Date | null = null;
  return async () => {
    const now = input.now();
    if (
      !shouldRunScheduledAuditVerification({
        lastRunAt,
        now,
        intervalMs: input.intervalMs,
      })
    ) {
      return { jobsClaimed: 0 };
    }
    const result = await input.run();
    lastRunAt = now;
    return {
      jobsClaimed: result.failedDocumentCount > 0 ? result.failedDocumentCount : 0,
    };
  };
}

export { createRunScheduledAuditVerification, VERIFY_AUDIT_CHAINS_JOB_TYPE };
