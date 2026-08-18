import type {
  AccountUser,
  AuditEvent,
  BackgroundJob,
  ConsentRecord,
  Document,
  DocumentRevision,
  FinalizedArtifact,
  IdempotencyRecord,
  Organization,
  OrganizationMembership,
  OutboxEvent,
  SignatureField,
  Signer,
  SigningSession,
} from '../entities.js';
import type { AssertTenantScopedRepository } from './tenant-scope.js';

export type UserRepository = {
  findById: (input: { userId: string }) => Promise<AccountUser | null>;
  findByEmail: (input: { email: string }) => Promise<AccountUser | null>;
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
};

export type SignerRepository = {
  findById: (input: { organizationId: string; signerId: string }) => Promise<Signer | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly Signer[]>;
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
};

export type ConsentRecordRepository = {
  findById: (input: { organizationId: string; consentId: string }) => Promise<ConsentRecord | null>;
  listByDocument: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<readonly ConsentRecord[]>;
};

export type FinalizedArtifactRepository = {
  findByDocument: (input: {
    organizationId: string;
    documentId: string;
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
};

export type TenantRepositories = {
  readonly organizations: OrganizationRepository;
  readonly memberships: MembershipRepository;
  readonly documents: DocumentRepository;
  readonly revisions: DocumentRevisionRepository;
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

export const TENANT_REPOSITORY_TYPE_GUARDS: {
  documents: _DocumentsOk;
  memberships: _MembershipsOk;
  revisions: _RevisionsOk;
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
