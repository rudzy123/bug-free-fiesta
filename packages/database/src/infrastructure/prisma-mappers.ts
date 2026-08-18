import type {
  AccountSession,
  AccountSecurityEventType as DomainAccountSecurityEventType,
  AuditActorType as DomainAuditActorType,
  AuditEvent,
  AuditEventType as DomainAuditEventType,
  BackgroundJob,
  BackgroundJobStatus as DomainBackgroundJobStatus,
  ConsentRecord,
  Document,
  DocumentRevision,
  DocumentRevisionKind as DomainDocumentRevisionKind,
  DocumentState as DomainDocumentState,
  FinalizedArtifact,
  IdempotencyPrincipalType as DomainIdempotencyPrincipalType,
  IdempotencyRecord,
  Organization,
  OrganizationMembership,
  OutboxEvent,
  OutboxStatus as DomainOutboxStatus,
  SignatureField,
  SignatureFieldType as DomainSignatureFieldType,
  Signer,
  SignerStatus as DomainSignerStatus,
  SigningSession,
  SigningSessionStatus as DomainSigningSessionStatus,
  AccountUser,
} from '@esign/domain';
import type { MembershipRole as DomainMembershipRole } from '@esign/domain';
import type {
  AuditLog as PrismaAuditLog,
  BackgroundJob as PrismaBackgroundJob,
  ConsentRecord as PrismaConsentRecord,
  Document as PrismaDocument,
  DocumentRevision as PrismaDocumentRevision,
  FinalizedArtifact as PrismaFinalizedArtifact,
  IdempotencyRecord as PrismaIdempotencyRecord,
  Organization as PrismaOrganization,
  OrganizationMembership as PrismaMembership,
  OutboxEvent as PrismaOutboxEvent,
  SignatureField as PrismaSignatureField,
  Signer as PrismaSigner,
  SigningSession as PrismaSigningSession,
  User as PrismaUser,
  AccountSession as PrismaAccountSession,
} from '../generated/client/index.js';
import {
  AccountSecurityEventType,
  AuditActorType,
  AuditEventType,
  BackgroundJobStatus,
  DocumentRevisionKind,
  DocumentState,
  IdempotencyPrincipalType,
  MembershipRole,
  OutboxStatus,
  Prisma,
  SignatureFieldType,
  SignerStatus,
  SigningSessionStatus,
} from '../generated/client/index.js';

export const MEMBERSHIP_ROLE_TO_DOMAIN: Record<MembershipRole, DomainMembershipRole> = {
  [MembershipRole.owner]: 'owner',
  [MembershipRole.admin]: 'admin',
  [MembershipRole.member]: 'member',
  [MembershipRole.readOnly]: 'read_only',
};

export const ACCOUNT_SECURITY_EVENT_TYPE_TO_PRISMA: Record<
  DomainAccountSecurityEventType,
  AccountSecurityEventType
> = {
  login_succeeded: AccountSecurityEventType.loginSucceeded,
  login_failed: AccountSecurityEventType.loginFailed,
  logout: AccountSecurityEventType.logout,
  session_revoked: AccountSecurityEventType.sessionRevoked,
};

export const DOCUMENT_STATE_TO_PRISMA: Record<DomainDocumentState, DocumentState> = {
  draft: DocumentState.draft,
  sent: DocumentState.sent,
  in_progress: DocumentState.inProgress,
  completed: DocumentState.completed,
  finalizing: DocumentState.finalizing,
  finalized: DocumentState.finalized,
  voided: DocumentState.voided,
  expired: DocumentState.expired,
  declined: DocumentState.declined,
  finalization_failed: DocumentState.finalizationFailed,
};

export const DOCUMENT_STATE_TO_DOMAIN: Record<DocumentState, DomainDocumentState> = {
  [DocumentState.draft]: 'draft',
  [DocumentState.sent]: 'sent',
  [DocumentState.inProgress]: 'in_progress',
  [DocumentState.completed]: 'completed',
  [DocumentState.finalizing]: 'finalizing',
  [DocumentState.finalized]: 'finalized',
  [DocumentState.voided]: 'voided',
  [DocumentState.expired]: 'expired',
  [DocumentState.declined]: 'declined',
  [DocumentState.finalizationFailed]: 'finalization_failed',
};

const SIGNER_STATUS_TO_DOMAIN: Record<SignerStatus, DomainSignerStatus> = {
  [SignerStatus.pending]: 'pending',
  [SignerStatus.signed]: 'signed',
  [SignerStatus.declined]: 'declined',
};

const SESSION_STATUS_TO_DOMAIN: Record<SigningSessionStatus, DomainSigningSessionStatus> = {
  [SigningSessionStatus.issued]: 'issued',
  [SigningSessionStatus.active]: 'active',
  [SigningSessionStatus.completed]: 'completed',
  [SigningSessionStatus.expired]: 'expired',
  [SigningSessionStatus.revoked]: 'revoked',
};

const FIELD_TYPE_TO_DOMAIN: Record<SignatureFieldType, DomainSignatureFieldType> = {
  [SignatureFieldType.signature]: 'signature',
  [SignatureFieldType.initials]: 'initials',
  [SignatureFieldType.dateSigned]: 'date_signed',
};

const REVISION_KIND_TO_DOMAIN: Record<DocumentRevisionKind, DomainDocumentRevisionKind> = {
  [DocumentRevisionKind.source]: 'source',
  [DocumentRevisionKind.intermediate]: 'intermediate',
};

export const AUDIT_EVENT_TYPE_TO_PRISMA: Record<DomainAuditEventType, AuditEventType> = {
  document_created: AuditEventType.documentCreated,
  revision_added: AuditEventType.revisionAdded,
  fields_updated: AuditEventType.fieldsUpdated,
  signers_updated: AuditEventType.signersUpdated,
  document_sent: AuditEventType.documentSent,
  session_issued: AuditEventType.sessionIssued,
  session_revoked: AuditEventType.sessionRevoked,
  consent_recorded: AuditEventType.consentRecorded,
  signer_signed: AuditEventType.signerSigned,
  signer_declined: AuditEventType.signerDeclined,
  document_voided: AuditEventType.documentVoided,
  document_expired: AuditEventType.documentExpired,
  finalization_started: AuditEventType.finalizationStarted,
  document_finalized: AuditEventType.documentFinalized,
  finalization_failed: AuditEventType.finalizationFailed,
  artifact_downloaded: AuditEventType.artifactDownloaded,
};

export const AUDIT_ACTOR_TYPE_TO_PRISMA: Record<DomainAuditActorType, AuditActorType> = {
  account_user: AuditActorType.accountUser,
  signer: AuditActorType.signer,
  worker: AuditActorType.worker,
  system: AuditActorType.system,
};

const AUDIT_EVENT_TYPE_TO_DOMAIN: Record<AuditEventType, DomainAuditEventType> = {
  [AuditEventType.documentCreated]: 'document_created',
  [AuditEventType.revisionAdded]: 'revision_added',
  [AuditEventType.fieldsUpdated]: 'fields_updated',
  [AuditEventType.signersUpdated]: 'signers_updated',
  [AuditEventType.documentSent]: 'document_sent',
  [AuditEventType.sessionIssued]: 'session_issued',
  [AuditEventType.sessionRevoked]: 'session_revoked',
  [AuditEventType.consentRecorded]: 'consent_recorded',
  [AuditEventType.signerSigned]: 'signer_signed',
  [AuditEventType.signerDeclined]: 'signer_declined',
  [AuditEventType.documentVoided]: 'document_voided',
  [AuditEventType.documentExpired]: 'document_expired',
  [AuditEventType.finalizationStarted]: 'finalization_started',
  [AuditEventType.documentFinalized]: 'document_finalized',
  [AuditEventType.finalizationFailed]: 'finalization_failed',
  [AuditEventType.artifactDownloaded]: 'artifact_downloaded',
};

const AUDIT_ACTOR_TYPE_TO_DOMAIN: Record<AuditActorType, DomainAuditActorType> = {
  [AuditActorType.accountUser]: 'account_user',
  [AuditActorType.signer]: 'signer',
  [AuditActorType.worker]: 'worker',
  [AuditActorType.system]: 'system',
};

const OUTBOX_STATUS_TO_DOMAIN: Record<OutboxStatus, DomainOutboxStatus> = {
  [OutboxStatus.pending]: 'pending',
  [OutboxStatus.processing]: 'processing',
  [OutboxStatus.processed]: 'processed',
  [OutboxStatus.failed]: 'failed',
};

const JOB_STATUS_TO_DOMAIN: Record<BackgroundJobStatus, DomainBackgroundJobStatus> = {
  [BackgroundJobStatus.pending]: 'pending',
  [BackgroundJobStatus.leased]: 'leased',
  [BackgroundJobStatus.succeeded]: 'succeeded',
  [BackgroundJobStatus.failed]: 'failed',
  [BackgroundJobStatus.cancelled]: 'cancelled',
};

const IDEMPOTENCY_PRINCIPAL_TO_DOMAIN: Record<
  IdempotencyPrincipalType,
  DomainIdempotencyPrincipalType
> = {
  [IdempotencyPrincipalType.accountUser]: 'account_user',
  [IdempotencyPrincipalType.signer]: 'signer',
  [IdempotencyPrincipalType.worker]: 'worker',
  [IdempotencyPrincipalType.system]: 'system',
};

function jsonRecord(value: Prisma.JsonValue): Readonly<Record<string, unknown>> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asInputJson(value: Readonly<Record<string, unknown>>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function toDomainOrganization(row: PrismaOrganization): Organization {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainUser(row: PrismaUser): AccountUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainMembership(row: PrismaMembership): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: MEMBERSHIP_ROLE_TO_DOMAIN[row.role],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainDocument(row: PrismaDocument): Document {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerMembershipId: row.ownerMembershipId,
    title: row.title,
    state: DOCUMENT_STATE_TO_DOMAIN[row.state],
    expiresAt: row.expiresAt,
    currentRevisionId: row.currentRevisionId,
    signingRevisionId: row.signingRevisionId,
    version: row.version,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
    finalizationAttemptCount: row.finalizationAttemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainRevision(row: PrismaDocumentRevision): DocumentRevision {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    kind: REVISION_KIND_TO_DOMAIN[row.kind],
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256Digest: row.sha256Digest,
    createdAt: row.createdAt,
  };
}

export function toDomainSigner(row: PrismaSigner): Signer {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    accountUserId: row.accountUserId,
    routingOrder: row.routingOrder,
    status: SIGNER_STATUS_TO_DOMAIN[row.status],
    email: row.email,
    displayName: row.displayName,
    version: row.version,
    completedAt: row.completedAt,
    declinedAt: row.declinedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainSigningSession(row: PrismaSigningSession): SigningSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    signerId: row.signerId,
    tokenHash: row.tokenHash,
    status: SESSION_STATUS_TO_DOMAIN[row.status],
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    completedAt: row.completedAt,
    revokedAt: row.revokedAt,
    presentationAttemptCount: row.presentationAttemptCount,
    failedPresentationCount: row.failedPresentationCount,
    lastPresentedAt: row.lastPresentedAt,
    requestId: row.requestId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainSignatureField(row: PrismaSignatureField): SignatureField {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    signerId: row.signerId,
    type: FIELD_TYPE_TO_DOMAIN[row.type],
    pageNumber: row.pageNumber,
    x: decimalToNumber(row.x),
    y: decimalToNumber(row.y),
    width: decimalToNumber(row.width),
    height: decimalToNumber(row.height),
    required: row.required,
    completedAt: row.completedAt,
    completionObjectKey: row.completionObjectKey,
    completionContentType: row.completionContentType,
    completionSizeBytes: row.completionSizeBytes,
    completionSha256Digest: row.completionSha256Digest,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainConsent(row: PrismaConsentRecord): ConsentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    signerId: row.signerId,
    sessionId: row.sessionId,
    consentCopyId: row.consentCopyId,
    acceptedAt: row.acceptedAt,
    requestId: row.requestId,
    untrustedClientIp: row.untrustedClientIp,
    untrustedUserAgent: row.untrustedUserAgent,
    createdAt: row.createdAt,
  };
}

export function toDomainArtifact(row: PrismaFinalizedArtifact): FinalizedArtifact {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256Digest: row.sha256Digest,
    createdAt: row.createdAt,
  };
}

export function toDomainAuditEvent(row: PrismaAuditLog): AuditEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    sequence: row.sequence,
    type: AUDIT_EVENT_TYPE_TO_DOMAIN[row.type],
    actorType: AUDIT_ACTOR_TYPE_TO_DOMAIN[row.actorType],
    actorId: row.actorId,
    occurredAt: row.occurredAt,
    payload: jsonRecord(row.payload),
    previousEventHash: row.previousEventHash,
    eventHash: row.eventHash,
    requestId: row.requestId,
    chainVersion: row.chainVersion,
    createdAt: row.createdAt,
  };
}

export function toDomainOutboxEvent(row: PrismaOutboxEvent): OutboxEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    type: row.type,
    status: OUTBOX_STATUS_TO_DOMAIN[row.status],
    payload: jsonRecord(row.payload),
    requestId: row.requestId,
    attemptCount: row.attemptCount,
    availableAt: row.availableAt,
    processedAt: row.processedAt,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainBackgroundJob(row: PrismaBackgroundJob): BackgroundJob {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    outboxEventId: row.outboxEventId,
    type: row.type,
    status: JOB_STATUS_TO_DOMAIN[row.status],
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    lastErrorCode: row.lastErrorCode,
    requestId: row.requestId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainIdempotency(row: PrismaIdempotencyRecord): IdempotencyRecord {
  const body = row.responseBody;
  return {
    id: row.id,
    organizationId: row.organizationId,
    principalType: IDEMPOTENCY_PRINCIPAL_TO_DOMAIN[row.principalType],
    principalId: row.principalId,
    route: row.route,
    key: row.key,
    requestHash: row.requestHash,
    requestId: row.requestId,
    responseStatus: row.responseStatus,
    responseBody:
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDomainAccountSession(row: PrismaAccountSession): AccountSession {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    csrfTokenHash: row.csrfTokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}
