export const AUDIT_VERIFICATION_FAILURE_CODES = [
  'EMPTY_CHAIN',
  'UNSUPPORTED_SCHEMA_VERSION',
  'SEQUENCE_GAP',
  'SEQUENCE_REORDER',
  'HASH_MISMATCH',
  'PREVIOUS_HASH_MISMATCH',
  'GENESIS_PREVIOUS_HASH_MISMATCH',
  'ARTIFACT_DIGEST_MISMATCH',
  'ARTIFACT_MISSING',
  'FORBIDDEN_PAYLOAD_FIELD',
  'CHECKPOINT_MISMATCH',
] as const;

export type AuditVerificationFailureCode = (typeof AUDIT_VERIFICATION_FAILURE_CODES)[number];

export const AUDIT_VERIFICATION_WARNING_CODES = [
  'CHECKPOINT_ANCHORING_DISABLED',
  'CHECKPOINT_STORE_UNAVAILABLE',
] as const;

export type AuditVerificationWarningCode = (typeof AUDIT_VERIFICATION_WARNING_CODES)[number];

export type AuditVerificationFailure = {
  readonly code: AuditVerificationFailureCode;
  readonly organizationId: string;
  readonly documentId: string;
  readonly sequence: number | null;
  readonly eventId: string | null;
};

export type AuditVerificationWarning = {
  readonly code: AuditVerificationWarningCode;
  readonly organizationId: string;
  readonly documentId: string;
};

export type AuditVerificationReport = {
  readonly ok: boolean;
  readonly schemaVersion: number;
  readonly organizationId: string;
  readonly documentId: string;
  readonly eventCount: number;
  readonly checkedAt: string;
  readonly headEventHash: string | null;
  readonly headSequence: number | null;
  readonly failures: readonly AuditVerificationFailure[];
  readonly warnings: readonly AuditVerificationWarning[];
};

export type OrganizationAuditVerificationReport = {
  readonly ok: boolean;
  readonly organizationId: string;
  readonly documentCount: number;
  readonly failedDocumentCount: number;
  readonly checkedAt: string;
  readonly reports: readonly AuditVerificationReport[];
};

export function isAuditVerificationFailureCode(
  value: string,
): value is AuditVerificationFailureCode {
  return (AUDIT_VERIFICATION_FAILURE_CODES as readonly string[]).includes(value);
}
