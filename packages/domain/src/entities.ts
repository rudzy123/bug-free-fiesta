import type { MembershipRole } from './request-actor.js';

export const DOCUMENT_STATES = [
  'draft',
  'prepared',
  'sent',
  'in_progress',
  'completed',
  'finalizing',
  'finalized',
  'voided',
  'expired',
  'declined',
  'finalization_failed',
] as const;

export type DocumentState = (typeof DOCUMENT_STATES)[number];

export const SIGNER_STATUSES = ['pending', 'signed', 'declined'] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNING_SESSION_STATUSES = [
  'issued',
  'active',
  'completed',
  'expired',
  'revoked',
] as const;
export type SigningSessionStatus = (typeof SIGNING_SESSION_STATUSES)[number];

export const SIGNATURE_FIELD_TYPES = [
  'signature',
  'initials',
  'date_signed',
  'signer_name',
] as const;
export type SignatureFieldType = (typeof SIGNATURE_FIELD_TYPES)[number];

export const SIGNING_MODES = ['ordered', 'parallel'] as const;
export type SigningMode = (typeof SIGNING_MODES)[number];

export const FIELD_OVERLAP_POLICIES = ['prohibit', 'allow'] as const;
export type FieldOverlapPolicy = (typeof FIELD_OVERLAP_POLICIES)[number];

export const DOCUMENT_REVISION_KINDS = ['source', 'intermediate'] as const;
export type DocumentRevisionKind = (typeof DOCUMENT_REVISION_KINDS)[number];

export const DOCUMENT_INSPECTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type DocumentInspectionStatus = (typeof DOCUMENT_INSPECTION_STATUSES)[number];

export const UPLOAD_SESSION_STATUSES = ['issued', 'completed', 'expired', 'abandoned'] as const;
export type UploadSessionStatus = (typeof UPLOAD_SESSION_STATUSES)[number];

export const INSPECT_DOCUMENT_JOB_TYPE = 'inspect_document';
export const NOTIFY_SIGNER_JOB_TYPE = 'notify_signer';

export const AUDIT_ACTOR_TYPES = ['account_user', 'signer', 'worker', 'system'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_EVENT_TYPES = [
  'document_created',
  'revision_added',
  'fields_updated',
  'signers_updated',
  'document_sent',
  'session_issued',
  'session_revoked',
  'session_exchanged',
  'document_viewed',
  'consent_recorded',
  'signer_signed',
  'signer_declined',
  'document_voided',
  'document_expired',
  'finalization_started',
  'document_finalized',
  'finalization_failed',
  'artifact_downloaded',
  'inspection_accepted',
  'inspection_rejected',
  'upload_abandoned',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const OUTBOX_STATUSES = ['pending', 'processing', 'processed', 'failed'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const BACKGROUND_JOB_STATUSES = [
  'pending',
  'leased',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

export const JOB_ERROR_CATEGORIES = ['retryable', 'non_retryable'] as const;
export type JobErrorCategory = (typeof JOB_ERROR_CATEGORIES)[number];

export const DEFAULT_JOB_MAX_ATTEMPTS = 8;

export const IDEMPOTENCY_PRINCIPAL_TYPES = ['account_user', 'signer', 'worker', 'system'] as const;
export type IdempotencyPrincipalType = (typeof IDEMPOTENCY_PRINCIPAL_TYPES)[number];

export type Organization = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AccountUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type OrganizationMembership = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const ACCOUNT_SECURITY_EVENT_TYPES = [
  'login_succeeded',
  'login_failed',
  'logout',
  'session_revoked',
] as const;
export type AccountSecurityEventType = (typeof ACCOUNT_SECURITY_EVENT_TYPES)[number];

export type AccountSession = {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
};

export type AccountSecurityEvent = {
  readonly id: string;
  readonly type: AccountSecurityEventType;
  readonly actorUserId: string | null;
  readonly sessionId: string | null;
  readonly requestId: string | null;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
};

export type Document = {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerMembershipId: string;
  readonly title: string;
  readonly state: DocumentState;
  readonly signingMode: SigningMode;
  readonly inspectionStatus: DocumentInspectionStatus;
  readonly sourceDisplayName: string | null;
  readonly expiresAt: Date | null;
  readonly currentRevisionId: string | null;
  readonly signingRevisionId: string | null;
  readonly version: number;
  readonly leaseOwner: string | null;
  readonly leaseUntil: Date | null;
  readonly finalizationAttemptCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type DocumentRevision = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly kind: DocumentRevisionKind;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: bigint;
  readonly sha256Digest: string;
  readonly displayName: string;
  readonly pageCount: number;
  readonly createdAt: Date;
};

export type UploadSession = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly tokenHash: string;
  readonly status: UploadSessionStatus;
  readonly displayName: string;
  readonly contentType: string;
  readonly maxBytes: bigint;
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
  readonly revisionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PreviewGrant = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
};

export type Signer = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly accountUserId: string | null;
  readonly routingOrder: number;
  readonly status: SignerStatus;
  readonly email: string | null;
  readonly displayName: string;
  readonly version: number;
  readonly completedAt: Date | null;
  readonly declinedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SigningSession = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly tokenHash: string;
  readonly csrfTokenHash: string | null;
  readonly status: SigningSessionStatus;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly completedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly presentationAttemptCount: number;
  readonly failedPresentationCount: number;
  readonly lastPresentedAt: Date | null;
  readonly requestId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SignatureField = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly type: SignatureFieldType;
  readonly pageNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly required: boolean;
  readonly completedAt: Date | null;
  readonly completionObjectKey: string | null;
  readonly completionContentType: string | null;
  readonly completionSizeBytes: bigint | null;
  readonly completionSha256Digest: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ConsentRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly consentCopyId: string;
  readonly acceptedAt: Date;
  readonly requestId: string | null;
  readonly untrustedClientIp: string | null;
  readonly untrustedUserAgent: string | null;
  readonly createdAt: Date;
};

export type FinalizedArtifact = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: bigint;
  readonly sha256Digest: string;
  readonly createdAt: Date;
};

export type AuditEvent = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly sequence: number;
  readonly type: AuditEventType;
  readonly actorType: AuditActorType;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly previousEventHash: string;
  readonly eventHash: string;
  readonly requestId: string | null;
  readonly chainVersion: number;
  readonly createdAt: Date;
};

export type OutboxEvent = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string | null;
  readonly type: string;
  readonly status: OutboxStatus;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestId: string | null;
  readonly attemptCount: number;
  readonly leaseOwner: string | null;
  readonly leaseUntil: Date | null;
  readonly availableAt: Date;
  readonly processedAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type BackgroundJob = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string | null;
  readonly outboxEventId: string | null;
  readonly type: string;
  readonly status: BackgroundJobStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string | null;
  readonly leaseUntil: Date | null;
  readonly availableAt: Date;
  readonly lastErrorCode: string | null;
  readonly requestId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type IdempotencyRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly principalType: IdempotencyPrincipalType;
  readonly principalId: string;
  readonly route: string;
  readonly key: string;
  readonly requestHash: string;
  readonly requestId: string | null;
  readonly responseStatus: number | null;
  readonly responseBody: Readonly<Record<string, unknown>> | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
