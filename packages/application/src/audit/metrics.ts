import type { AuditVerificationMetrics, AuditVerificationMetricsSnapshot } from '@esign/domain';

export function createMemoryAuditVerificationMetrics(): AuditVerificationMetrics & {
  snapshot: () => AuditVerificationMetricsSnapshot;
} {
  let verifiedOk = 0;
  let verifiedFailed = 0;
  let lastFailureCodes: string[] = [];
  let lastFailedAt: Date | null = null;

  return {
    recordVerified(input) {
      if (input.ok) {
        verifiedOk += 1;
        return;
      }
      verifiedFailed += 1;
      lastFailureCodes = [...input.failureCodes];
      lastFailedAt = new Date();
    },
    snapshot() {
      return {
        verifiedOk,
        verifiedFailed,
        lastFailureCodes,
        lastFailedAt,
      };
    },
  };
}

export function createNoopAuditVerificationAlertSink(): import('@esign/domain').AuditVerificationAlertSink {
  return {
    async notify() {
      return;
    },
  };
}
