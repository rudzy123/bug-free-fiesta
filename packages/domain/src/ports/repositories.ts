import type {
  AccountUser,
  AuditEvent,
  BackgroundJob,
  ConsentRecord,
  Document,
  DocumentInspectionStatus,
  DocumentRevision,
  FinalizedArtifact,
  IdempotencyRecord,
  Organization,
  OrganizationMembership,
  OutboxEvent,
  PreviewGrant,
  SignatureField,
  Signer,
  SigningMode,
  SigningSession,
  UploadSession,
} from '../entities.js';
import type { AssertTenantScopedRepository } from './tenant-scope.js';

export type UserRepository = {
  findById: (input: { userId: string }) => Promise<AccountUser | null>;
  findByEmail: (input: { email: string }) => Promise<AccountUser | null>;
  listMemberships: (input: { userId: string }) => Promise<readonly OrganizationMembership[]>;
};

export type OrganizationRepository = {
  findById: (input: { organizationId: string }) => Promise<Organization | null>;
};

export type MembershipRepository = {
  findById: (input: {
    organizationId: string;
    membershipId: string;
  }) => Promise<OrganizationMembership | null>;
  findByUser: (input: {
    organizationId: string;
    userId: string;
  }) => Promise<OrganizationMembership | null>;
};

export type DocumentRepository = {
  findById: (input: { organizationId: string; documentId: string }) => Promise<Document | null>;
  listByOrganization: (input: { organizationId: string }) => Promise<readonly Document[]>;
  create: (input: { organizationId: string; document: Document }) => Promise<Document>;
  attachSourceRevision: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    revisionId: string;
    sourceDisplayName: string;
  }) => Promise<Document>;
  setInspectionStatus: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    inspectionStatus: DocumentInspectionStatus;
  }) => Promise<Document>;
  setSigningMode: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    signingMode: SigningMode;
  }) => Promise<Document>;
  setPreparationState: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    state: 'draft' | 'prepared';
  }) => Promise<Document>;
  markSent: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    signingRevisionId: string;
    expiresAt: Date | null;
  }) => Promise<Document>;
  markDeclined: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
  }) => Promise<Document>;
  markInProgress: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
  }) => Promise<Document>;
  markCompleted: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
  }) => Promise<Document>;
  claimProcessingLease: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    owner: string;
    leaseUntil: Date;
    now: Date;
  }) => Promise<Document>;
  commitFlattenedRevision: (input: {
    organizationId: string;
    documentId: string;
    expectedVersion: number;
    owner: string;
    revisionId: string;
    finalize: boolean;
  }) => Promise<Document>;
  markFinalizationFailed: (input: {
    organizationId: string;
    documentId: string;
    owner: string;
  }) => Promise<Document>;
  releaseProcessingLease: (input: {
    organizationId: string;
    documentId: string;
    owner: string;
  }) => Promise<void>;
};

export type DocumentRevisionRepository = {
  findById: (input: {
    organizationId: string;
    revisionId: string;
  }) => Promise<DocumentRevision | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly DocumentRevision[]>;
  create: (input: {
    organizationId: string;
    revision: DocumentRevision;
  }) => Promise<DocumentRevision>;
  findFirstByObjectKey: (input: {
    organizationId: string;
    objectKey: string;
  }) => Promise<DocumentRevision | null>;
};

export type UploadSessionRepository = {
  create: (input: { organizationId: string; session: UploadSession }) => Promise<UploadSession>;
  findById: (input: {
    organizationId: string;
    uploadSessionId: string;
  }) => Promise<UploadSession | null>;
  complete: (input: {
    organizationId: string;
    uploadSessionId: string;
    revisionId: string;
    completedAt: Date;
  }) => Promise<UploadSession>;
  markAbandoned: (input: {
    organizationId: string;
    uploadSessionId: string;
    abandonedAt: Date;
  }) => Promise<UploadSession>;
};

export type UploadSessionLookup = {
  findByTokenHash: (tokenHash: string) => Promise<UploadSession | null>;
  listExpiredIssued: (input: { now: Date; limit: number }) => Promise<readonly UploadSession[]>;
};

export type PreviewGrantRepository = {
  create: (input: { organizationId: string; grant: PreviewGrant }) => Promise<PreviewGrant>;
  findById: (input: { organizationId: string; grantId: string }) => Promise<PreviewGrant | null>;
};

export type PreviewGrantLookup = {
  findByTokenHash: (tokenHash: string) => Promise<PreviewGrant | null>;
};

export type SignerRepository = {
  findById: (input: { organizationId: string; signerId: string }) => Promise<Signer | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly Signer[]>;
  replaceAll: (input: {
    organizationId: string;
    documentId: string;
    signers: readonly Signer[];
  }) => Promise<readonly Signer[]>;
  markDeclined: (input: {
    organizationId: string;
    signerId: string;
    expectedVersion: number;
    declinedAt: Date;
  }) => Promise<Signer>;
  markSigned: (input: {
    organizationId: string;
    signerId: string;
    expectedVersion: number;
    completedAt: Date;
  }) => Promise<Signer>;
};

export type SigningSessionRepository = {
  findById: (input: {
    organizationId: string;
    sessionId: string;
  }) => Promise<SigningSession | null>;
  listBySigner: (input: {
    organizationId: string;
    signerId: string;
  }) => Promise<readonly SigningSession[]>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly SigningSession[]>;
  listOpenBySigner: (input: {
    organizationId: string;
    signerId: string;
  }) => Promise<readonly SigningSession[]>;
  create: (input: { organizationId: string; session: SigningSession }) => Promise<SigningSession>;
  revoke: (input: {
    organizationId: string;
    sessionId: string;
    revokedAt: Date;
  }) => Promise<SigningSession>;
  markPresented: (input: {
    organizationId: string;
    sessionId: string;
    presentedAt: Date;
  }) => Promise<SigningSession>;
  markExpired: (input: {
    organizationId: string;
    sessionId: string;
    expiredAt: Date;
  }) => Promise<SigningSession>;
  consumeAndRotate: (input: {
    organizationId: string;
    sessionId: string;
    expectedVersion: number;
    tokenHash: string;
    csrfTokenHash: string;
    consumedAt: Date;
  }) => Promise<SigningSession>;
  markCompleted: (input: {
    organizationId: string;
    sessionId: string;
    completedAt: Date;
  }) => Promise<SigningSession>;
};

export type SigningTokenLookup = {
  findByTokenHash: (tokenHash: string) => Promise<SigningSession | null>;
};

export type SignatureFieldRepository = {
  findById: (input: { organizationId: string; fieldId: string }) => Promise<SignatureField | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly SignatureField[]>;
  replaceAll: (input: {
    organizationId: string;
    documentId: string;
    fields: readonly SignatureField[];
  }) => Promise<readonly SignatureField[]>;
  complete: (input: {
    organizationId: string;
    fieldId: string;
    completedAt: Date;
    completionObjectKey: string | null;
    completionContentType: string | null;
    completionSizeBytes: bigint | null;
    completionSha256Digest: string | null;
  }) => Promise<SignatureField>;
  markFlattened: (input: {
    organizationId: string;
    fieldId: string;
    flattenedRevisionId: string;
  }) => Promise<SignatureField>;
  findFirstByCompletionObjectKey: (input: {
    organizationId: string;
    objectKey: string;
  }) => Promise<SignatureField | null>;
};

export type ConsentRecordRepository = {
  findById: (input: { organizationId: string; consentId: string }) => Promise<ConsentRecord | null>;
  findBySession: (input: {
    organizationId: string;
    sessionId: string;
  }) => Promise<ConsentRecord | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly ConsentRecord[]>;
  create: (input: { organizationId: string; consent: ConsentRecord }) => Promise<ConsentRecord>;
};

export type FinalizedArtifactRepository = {
  findByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<FinalizedArtifact | null>;
  create: (input: {
    organizationId: string;
    artifact: FinalizedArtifact;
  }) => Promise<FinalizedArtifact>;
  findFirstByObjectKey: (input: {
    organizationId: string;
    objectKey: string;
  }) => Promise<FinalizedArtifact | null>;
};

export type AuditLogRepository = {
  findLatest: (input: { organizationId: string; documentId: string }) => Promise<AuditEvent | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly AuditEvent[]>;
  append: (input: { organizationId: string; event: AuditEvent }) => Promise<AuditEvent>;
};

export type OutboxEventRepository = {
  findById: (input: {
    organizationId: string;
    outboxEventId: string;
  }) => Promise<OutboxEvent | null>;
  create: (input: { organizationId: string; event: OutboxEvent }) => Promise<OutboxEvent>;
};

export type BackgroundJobRepository = {
  findById: (input: { organizationId: string; jobId: string }) => Promise<BackgroundJob | null>;
};

export type IdempotencyRecordRepository = {
  find: (input: {
    organizationId: string;
    principalId: string;
    route: string;
    key: string;
  }) => Promise<IdempotencyRecord | null>;
  create: (input: {
    organizationId: string;
    record: IdempotencyRecord;
  }) => Promise<IdempotencyRecord>;
  complete: (input: {
    organizationId: string;
    recordId: string;
    responseStatus: number;
    responseBody: Readonly<Record<string, unknown>>;
  }) => Promise<IdempotencyRecord>;
};

export type TenantRepositories = {
  readonly organizations: OrganizationRepository;
  readonly memberships: MembershipRepository;
  readonly documents: DocumentRepository;
  readonly revisions: DocumentRevisionRepository;
  readonly uploadSessions: UploadSessionRepository;
  readonly previewGrants: PreviewGrantRepository;
  readonly signers: SignerRepository;
  readonly signingSessions: SigningSessionRepository;
  readonly signatureFields: SignatureFieldRepository;
  readonly consentRecords: ConsentRecordRepository;
  readonly finalizedArtifacts: FinalizedArtifactRepository;
  readonly auditLogs: AuditLogRepository;
  readonly outboxEvents: OutboxEventRepository;
  readonly backgroundJobs: BackgroundJobRepository;
  readonly idempotencyRecords: IdempotencyRecordRepository;
};

type _DocumentsOk =
  DocumentRepository extends AssertTenantScopedRepository<DocumentRepository> ? true : never;
type _MembershipsOk =
  MembershipRepository extends AssertTenantScopedRepository<MembershipRepository> ? true : never;
type _RevisionsOk =
  DocumentRevisionRepository extends AssertTenantScopedRepository<DocumentRevisionRepository>
    ? true
    : never;
type _SignersOk =
  SignerRepository extends AssertTenantScopedRepository<SignerRepository> ? true : never;
type _SessionsOk =
  SigningSessionRepository extends AssertTenantScopedRepository<SigningSessionRepository>
    ? true
    : never;
type _FieldsOk =
  SignatureFieldRepository extends AssertTenantScopedRepository<SignatureFieldRepository>
    ? true
    : never;
type _ConsentOk =
  ConsentRecordRepository extends AssertTenantScopedRepository<ConsentRecordRepository>
    ? true
    : never;
type _ArtifactsOk =
  FinalizedArtifactRepository extends AssertTenantScopedRepository<FinalizedArtifactRepository>
    ? true
    : never;
type _AuditOk =
  AuditLogRepository extends AssertTenantScopedRepository<AuditLogRepository> ? true : never;
type _OutboxOk =
  OutboxEventRepository extends AssertTenantScopedRepository<OutboxEventRepository> ? true : never;
type _JobsOk =
  BackgroundJobRepository extends AssertTenantScopedRepository<BackgroundJobRepository>
    ? true
    : never;
type _IdempotencyOk =
  IdempotencyRecordRepository extends AssertTenantScopedRepository<IdempotencyRecordRepository>
    ? true
    : never;
type _UploadSessionsOk =
  UploadSessionRepository extends AssertTenantScopedRepository<UploadSessionRepository>
    ? true
    : never;
type _PreviewGrantsOk =
  PreviewGrantRepository extends AssertTenantScopedRepository<PreviewGrantRepository>
    ? true
    : never;

export const TENANT_REPOSITORY_TYPE_GUARDS: {
  documents: _DocumentsOk;
  memberships: _MembershipsOk;
  revisions: _RevisionsOk;
  uploadSessions: _UploadSessionsOk;
  previewGrants: _PreviewGrantsOk;
  signers: _SignersOk;
  signingSessions: _SessionsOk;
  signatureFields: _FieldsOk;
  consentRecords: _ConsentOk;
  finalizedArtifacts: _ArtifactsOk;
  auditLogs: _AuditOk;
  outboxEvents: _OutboxOk;
  backgroundJobs: _JobsOk;
  idempotencyRecords: _IdempotencyOk;
} = {
  documents: true,
  memberships: true,
  revisions: true,
  uploadSessions: true,
  previewGrants: true,
  signers: true,
  signingSessions: true,
  signatureFields: true,
  consentRecords: true,
  finalizedArtifacts: true,
  auditLogs: true,
  outboxEvents: true,
  backgroundJobs: true,
  idempotencyRecords: true,
};
