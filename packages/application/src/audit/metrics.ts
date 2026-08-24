import type { AuditVerificationAlertSink, AuditVerificationMetrics } from '@esign/domain';

export function withAuditVerificationFailureHook(
  inner: AuditVerificationMetrics,
  onFailure: () => void,
): AuditVerificationMetrics {
  return {
    recordVerified(input) {
      inner.recordVerified(input);
      if (!input.ok) {
        onFailure();
      }
    },
    snapshot: () => inner.snapshot(),
  };
}

export function createMemoryAuditVerificationMetrics(): AuditVerificationMetrics {
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

export function createNoopAuditVerificationAlertSink(): AuditVerificationAlertSink {
  return {
    async notify() {
      return;
    },
  };
}

export function createLoggingAuditVerificationAlertSink(log: {
  error: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}): AuditVerificationAlertSink {
  return {
    async notify(alert) {
      log.error(
        {
          severity: alert.severity,
          alertCode: alert.code,
          organizationId: alert.organizationId,
          documentId: alert.documentId,
          failureCodes: alert.failureCodes,
          sequence: alert.sequence,
        },
        'audit verification failed',
      );
    },
  };
}

export function createRecordingAuditVerificationAlertSink(): AuditVerificationAlertSink & {
  alerts: import('@esign/domain').AuditVerificationAlert[];
} {
  const alerts: import('@esign/domain').AuditVerificationAlert[] = [];
  return {
    alerts,
    async notify(alert) {
      alerts.push(alert);
    },
  };
}
