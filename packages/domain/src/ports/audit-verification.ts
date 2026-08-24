export type AuditVerificationMetricsSnapshot = {
  readonly verifiedOk: number;
  readonly verifiedFailed: number;
  readonly lastFailureCodes: readonly string[];
  readonly lastFailedAt: Date | null;
};

export type AuditVerificationMetrics = {
  recordVerified: (input: { ok: boolean; failureCodes: readonly string[] }) => void;
  snapshot: () => AuditVerificationMetricsSnapshot;
};

export type AuditVerificationAlert = {
  readonly severity: 'high';
  readonly code: 'audit_verification_failed';
  readonly organizationId: string;
  readonly documentId: string;
  readonly failureCodes: readonly string[];
  readonly sequence: number | null;
};

export type AuditVerificationAlertSink = {
  notify: (alert: AuditVerificationAlert) => Promise<void>;
};
