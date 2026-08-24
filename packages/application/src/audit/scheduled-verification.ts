import { VERIFY_AUDIT_CHAINS_JOB_TYPE, type Clock } from '@esign/domain';
import type { VerifyOrganizationAuditChains } from './verify-audit-chain.js';

export type ScheduledAuditVerificationResult = {
  readonly organizationCount: number;
  readonly documentCount: number;
  readonly failedDocumentCount: number;
  readonly checkedAt: string;
};

export function createRunScheduledAuditVerification(deps: {
  listOrganizationIds: () => Promise<readonly string[]>;
  verifyOrganization: VerifyOrganizationAuditChains;
  clock: Clock;
}) {
  return async function runScheduledAuditVerification(): Promise<ScheduledAuditVerificationResult> {
    const organizationIds = await deps.listOrganizationIds();
    let documentCount = 0;
    let failedDocumentCount = 0;
    for (const organizationId of organizationIds) {
      const report = await deps.verifyOrganization({
        organizationId,
        actor: { type: 'system' },
      });
      documentCount += report.documentCount;
      failedDocumentCount += report.failedDocumentCount;
    }
    return {
      organizationCount: organizationIds.length,
      documentCount,
      failedDocumentCount,
      checkedAt: deps.clock.nowUtc().toISOString(),
    };
  };
}

export type RunScheduledAuditVerification = ReturnType<typeof createRunScheduledAuditVerification>;

export function shouldRunScheduledAuditVerification(input: {
  lastRunAt: Date | null;
  now: Date;
  intervalMs: number;
}): boolean {
  if (input.lastRunAt === null) {
    return true;
  }
  return input.now.getTime() - input.lastRunAt.getTime() >= input.intervalMs;
}

export { VERIFY_AUDIT_CHAINS_JOB_TYPE };
