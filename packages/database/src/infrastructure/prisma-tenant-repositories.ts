import {
  ConflictError,
  NotFoundError,
  requireOpaqueId,
  requireOrganizationId,
  type AuditLogRepository,
  type BackgroundJobRepository,
  type ConsentRecordRepository,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type FinalizedArtifactRepository,
  type IdempotencyRecordRepository,
  type MembershipRepository,
  type OrganizationRepository,
  type OutboxEventRepository,
  type PreviewGrantRepository,
  type SignatureFieldRepository,
  type SignerRepository,
  type SigningSessionRepository,
  type TenantRepositories,
  type UploadSessionRepository,
  type UserRepository,
} from '@esign/domain';
import { OutboxStatus, UploadSessionStatus } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  AUDIT_ACTOR_TYPE_TO_PRISMA,
  AUDIT_EVENT_TYPE_TO_PRISMA,
  DOCUMENT_INSPECTION_STATUS_TO_PRISMA,
  DOCUMENT_STATE_TO_PRISMA,
  IDEMPOTENCY_PRINCIPAL_TO_PRISMA,
  REVISION_KIND_TO_PRISMA,
  UPLOAD_SESSION_STATUS_TO_PRISMA,
  toDomainArtifact,
  toDomainAuditEvent,
  toDomainBackgroundJob,
  toDomainConsent,
  toDomainDocument,
  toDomainIdempotency,
  toDomainMembership,
  toDomainOrganization,
  toDomainOutboxEvent,
  toDomainPreviewGrant,
  toDomainRevision,
  toDomainSignatureField,
  toDomainSigner,
  toDomainSigningSession,
  toDomainUploadSession,
  toDomainUser,
  asInputJson,
} from './prisma-mappers.js';
import { assertSameOrganization, tenantCompoundWhere, tenantScope } from './tenant-where.js';

export function createPrismaUserRepository(prisma: PrismaClientOrTx): UserRepository {
  return {
    async findById(input) {
      const userId = requireOpaqueId(input.userId, 'userId');
      const row = await prisma.user.findUnique({ where: { id: userId } });
      return row ? toDomainUser(row) : null;
    },
    async findByEmail(input) {
      const email = input.email.trim().toLowerCase();
      const row = await prisma.user.findUnique({ where: { email } });
      return row ? toDomainUser(row) : null;
    },
    async listMemberships(input) {
      const userId = requireOpaqueId(input.userId, 'userId');
      const rows = await prisma.organizationMembership.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toDomainMembership);
    },
  };
}

export function createPrismaOrganizationRepository(
  prisma: PrismaClientOrTx,
): OrganizationRepository {
  return {
    async findById(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.organization.findUnique({ where: { id: organizationId } });
      return row ? toDomainOrganization(row) : null;
    },
  };
}

export function createPrismaMembershipRepository(prisma: PrismaClientOrTx): MembershipRepository {
  return {
    async findById(input) {
      const row = await prisma.organizationMembership.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.membershipId, 'membershipId'),
      });
      return row ? toDomainMembership(row) : null;
    },
    async findByUser(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const userId = requireOpaqueId(input.userId, 'userId');
      const row = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      return row ? toDomainMembership(row) : null;
    },
  };
}

export function createPrismaDocumentRepository(prisma: PrismaClientOrTx): DocumentRepository {
  return {
    async findById(input) {
      const row = await prisma.document.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.documentId, 'documentId'),
      });
      return row ? toDomainDocument(row) : null;
    },
    async listByOrganization(input) {
      const rows = await prisma.document.findMany({
        where: tenantScope(input.organizationId),
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toDomainDocument);
    },
    async create(input) {
      assertSameOrganization(input.organizationId, input.document.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.document.create({
        data: {
          id: input.document.id,
          organizationId,
          ownerMembershipId: input.document.ownerMembershipId,
          title: input.document.title,
          state: DOCUMENT_STATE_TO_PRISMA[input.document.state],
          inspectionStatus: DOCUMENT_INSPECTION_STATUS_TO_PRISMA[input.document.inspectionStatus],
          sourceDisplayName: input.document.sourceDisplayName,
          expiresAt: input.document.expiresAt,
          currentRevisionId: input.document.currentRevisionId,
          signingRevisionId: input.document.signingRevisionId,
          version: input.document.version,
          leaseOwner: input.document.leaseOwner,
          leaseUntil: input.document.leaseUntil,
          finalizationAttemptCount: input.document.finalizationAttemptCount,
          createdAt: input.document.createdAt,
          updatedAt: input.document.updatedAt,
        },
      });
      return toDomainDocument(row);
    },
    async attachSourceRevision(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: { organizationId, id: documentId, version: input.expectedVersion },
        data: {
          currentRevisionId: input.revisionId,
          sourceDisplayName: input.sourceDisplayName,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_version' });
      }
      const row = await prisma.document.findUnique({
        where: tenantCompoundWhere(organizationId, documentId, 'documentId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'document' });
      }
      return toDomainDocument(row);
    },
    async setInspectionStatus(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: { organizationId, id: documentId, version: input.expectedVersion },
        data: {
          inspectionStatus: DOCUMENT_INSPECTION_STATUS_TO_PRISMA[input.inspectionStatus],
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_version' });
      }
      const row = await prisma.document.findUnique({
        where: tenantCompoundWhere(organizationId, documentId, 'documentId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'document' });
      }
      return toDomainDocument(row);
    },
  };
}

export function createPrismaDocumentRevisionRepository(
  prisma: PrismaClientOrTx,
): DocumentRevisionRepository {
  return {
    async findById(input) {
      const row = await prisma.documentRevision.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.revisionId, 'revisionId'),
      });
      return row ? toDomainRevision(row) : null;
    },
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.documentRevision.findMany({
        where: { organizationId, documentId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toDomainRevision);
    },
    async create(input) {
      assertSameOrganization(input.organizationId, input.revision.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.documentRevision.create({
        data: {
          id: input.revision.id,
          organizationId,
          documentId: input.revision.documentId,
          kind: REVISION_KIND_TO_PRISMA[input.revision.kind],
          objectKey: input.revision.objectKey,
          contentType: input.revision.contentType,
          sizeBytes: input.revision.sizeBytes,
          sha256Digest: input.revision.sha256Digest,
          displayName: input.revision.displayName,
          createdAt: input.revision.createdAt,
        },
      });
      return toDomainRevision(row);
    },
  };
}

export function createPrismaUploadSessionRepository(
  prisma: PrismaClientOrTx,
): UploadSessionRepository {
  return {
    async create(input) {
      assertSameOrganization(input.organizationId, input.session.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.uploadSession.create({
        data: {
          id: input.session.id,
          organizationId,
          documentId: input.session.documentId,
          tokenHash: input.session.tokenHash,
          status: UPLOAD_SESSION_STATUS_TO_PRISMA[input.session.status],
          displayName: input.session.displayName,
          contentType: input.session.contentType,
          maxBytes: input.session.maxBytes,
          expiresAt: input.session.expiresAt,
          completedAt: input.session.completedAt,
          revisionId: input.session.revisionId,
          createdAt: input.session.createdAt,
          updatedAt: input.session.updatedAt,
        },
      });
      return toDomainUploadSession(row);
    },
    async findById(input) {
      const row = await prisma.uploadSession.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.uploadSessionId, 'uploadSessionId'),
      });
      return row ? toDomainUploadSession(row) : null;
    },
    async complete(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const uploadSessionId = requireOpaqueId(input.uploadSessionId, 'uploadSessionId');
      const result = await prisma.uploadSession.updateMany({
        where: { organizationId, id: uploadSessionId, status: UploadSessionStatus.issued },
        data: {
          status: UploadSessionStatus.completed,
          completedAt: input.completedAt,
          revisionId: input.revisionId,
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'upload_session_not_issued' });
      }
      const row = await prisma.uploadSession.findUnique({
        where: tenantCompoundWhere(organizationId, uploadSessionId, 'uploadSessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'upload_session' });
      }
      return toDomainUploadSession(row);
    },
    async markAbandoned(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const uploadSessionId = requireOpaqueId(input.uploadSessionId, 'uploadSessionId');
      const result = await prisma.uploadSession.updateMany({
        where: { organizationId, id: uploadSessionId, status: UploadSessionStatus.issued },
        data: { status: UploadSessionStatus.abandoned },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'upload_session_not_issued' });
      }
      const row = await prisma.uploadSession.findUnique({
        where: tenantCompoundWhere(organizationId, uploadSessionId, 'uploadSessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'upload_session' });
      }
      return toDomainUploadSession(row);
    },
  };
}

export function createPrismaPreviewGrantRepository(
  prisma: PrismaClientOrTx,
): PreviewGrantRepository {
  return {
    async create(input) {
      assertSameOrganization(input.organizationId, input.grant.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.previewGrant.create({
        data: {
          id: input.grant.id,
          organizationId,
          documentId: input.grant.documentId,
          revisionId: input.grant.revisionId,
          tokenHash: input.grant.tokenHash,
          expiresAt: input.grant.expiresAt,
          createdAt: input.grant.createdAt,
        },
      });
      return toDomainPreviewGrant(row);
    },
    async findById(input) {
      const row = await prisma.previewGrant.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.grantId, 'grantId'),
      });
      return row ? toDomainPreviewGrant(row) : null;
    },
  };
}

export function createPrismaSignerRepository(prisma: PrismaClientOrTx): SignerRepository {
  return {
    async findById(input) {
      const row = await prisma.signer.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.signerId, 'signerId'),
      });
      return row ? toDomainSigner(row) : null;
    },
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.signer.findMany({
        where: { organizationId, documentId },
        orderBy: { routingOrder: 'asc' },
      });
      return rows.map(toDomainSigner);
    },
  };
}

export function createPrismaSigningSessionRepository(
  prisma: PrismaClientOrTx,
): SigningSessionRepository {
  return {
    async findById(input) {
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.sessionId, 'sessionId'),
      });
      return row ? toDomainSigningSession(row) : null;
    },
    async listBySigner(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const signerId = requireOpaqueId(input.signerId, 'signerId');
      const rows = await prisma.signingSession.findMany({
        where: { organizationId, signerId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toDomainSigningSession);
    },
  };
}

export function createPrismaSignatureFieldRepository(
  prisma: PrismaClientOrTx,
): SignatureFieldRepository {
  return {
    async findById(input) {
      const row = await prisma.signatureField.findUnique({
        where: tenantCompoundWhere(input.organizationId, input.fieldId, 'fieldId'),
      });
      return row ? toDomainSignatureField(row) : null;
    },
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.signatureField.findMany({
        where: { organizationId, documentId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toDomainSignatureField);
    },
  };
}

export function createPrismaConsentRecordRepository(
  prisma: PrismaClientOrTx,
): ConsentRecordRepository {
  return {
    async findById(input) {
      const row = await prisma.consentRecord.findFirst({
        where: {
          ...tenantScope(input.organizationId),
          id: requireOpaqueId(input.consentId, 'consentId'),
        },
      });
      return row ? toDomainConsent(row) : null;
    },
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.consentRecord.findMany({
        where: { organizationId, documentId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toDomainConsent);
    },
  };
}

export function createPrismaFinalizedArtifactRepository(
  prisma: PrismaClientOrTx,
): FinalizedArtifactRepository {
  return {
    async findByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const row = await prisma.finalizedArtifact.findFirst({
        where: { organizationId, documentId },
      });
      return row ? toDomainArtifact(row) : null;
    },
  };
}

export function createPrismaAuditLogRepository(prisma: PrismaClientOrTx): AuditLogRepository {
  return {
    async findLatest(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const row = await prisma.auditLog.findFirst({
        where: { organizationId, documentId },
        orderBy: { sequence: 'desc' },
      });
      return row ? toDomainAuditEvent(row) : null;
    },
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.auditLog.findMany({
        where: { organizationId, documentId },
        orderBy: { sequence: 'asc' },
      });
      return rows.map(toDomainAuditEvent);
    },
    async append(input) {
      assertSameOrganization(input.organizationId, input.event.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.auditLog.create({
        data: {
          id: input.event.id,
          organizationId,
          documentId: input.event.documentId,
          sequence: input.event.sequence,
          type: AUDIT_EVENT_TYPE_TO_PRISMA[input.event.type],
          actorType: AUDIT_ACTOR_TYPE_TO_PRISMA[input.event.actorType],
          actorId: input.event.actorId,
          occurredAt: input.event.occurredAt,
          payload: asInputJson(input.event.payload),
          previousEventHash: input.event.previousEventHash,
          eventHash: input.event.eventHash,
          requestId: input.event.requestId,
          chainVersion: input.event.chainVersion,
        },
      });
      return toDomainAuditEvent(row);
    },
  };
}

export function createPrismaOutboxEventRepository(prisma: PrismaClientOrTx): OutboxEventRepository {
  return {
    async findById(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const outboxEventId = requireOpaqueId(input.outboxEventId, 'outboxEventId');
      const row = await prisma.outboxEvent.findFirst({
        where: { organizationId, id: outboxEventId },
      });
      return row ? toDomainOutboxEvent(row) : null;
    },
    async create(input) {
      assertSameOrganization(input.organizationId, input.event.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.outboxEvent.create({
        data: {
          id: input.event.id,
          organizationId,
          documentId: input.event.documentId,
          type: input.event.type,
          status: OutboxStatus.pending,
          payload: asInputJson(input.event.payload),
          requestId: input.event.requestId,
          attemptCount: input.event.attemptCount,
          availableAt: input.event.availableAt,
          processedAt: input.event.processedAt,
          lastErrorCode: input.event.lastErrorCode,
        },
      });
      return toDomainOutboxEvent(row);
    },
  };
}

export function createPrismaBackgroundJobRepository(
  prisma: PrismaClientOrTx,
): BackgroundJobRepository {
  return {
    async findById(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const jobId = requireOpaqueId(input.jobId, 'jobId');
      const row = await prisma.backgroundJob.findFirst({
        where: { organizationId, id: jobId },
      });
      return row ? toDomainBackgroundJob(row) : null;
    },
  };
}

export function createPrismaIdempotencyRecordRepository(
  prisma: PrismaClientOrTx,
): IdempotencyRecordRepository {
  return {
    async find(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.idempotencyRecord.findUnique({
        where: {
          organizationId_principalId_route_key: {
            organizationId,
            principalId: requireOpaqueId(input.principalId, 'principalId'),
            route: input.route,
            key: input.key,
          },
        },
      });
      return row ? toDomainIdempotency(row) : null;
    },
    async create(input) {
      assertSameOrganization(input.organizationId, input.record.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.idempotencyRecord.create({
        data: {
          id: input.record.id,
          organizationId,
          principalType: IDEMPOTENCY_PRINCIPAL_TO_PRISMA[input.record.principalType],
          principalId: input.record.principalId,
          route: input.record.route,
          key: input.record.key,
          requestHash: input.record.requestHash,
          requestId: input.record.requestId,
          responseStatus: input.record.responseStatus,
          responseBody: input.record.responseBody
            ? asInputJson(input.record.responseBody)
            : undefined,
          expiresAt: input.record.expiresAt,
          createdAt: input.record.createdAt,
          updatedAt: input.record.updatedAt,
        },
      });
      return toDomainIdempotency(row);
    },
    async complete(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const recordId = requireOpaqueId(input.recordId, 'recordId');
      const result = await prisma.idempotencyRecord.updateMany({
        where: { id: recordId, organizationId },
        data: {
          responseStatus: input.responseStatus,
          responseBody: asInputJson(input.responseBody),
        },
      });
      if (result.count !== 1) {
        throw new NotFoundError({ resource: 'idempotency_record' });
      }
      const row = await prisma.idempotencyRecord.findFirst({
        where: { id: recordId, organizationId },
      });
      if (!row) {
        throw new NotFoundError({ resource: 'idempotency_record' });
      }
      return toDomainIdempotency(row);
    },
  };
}

export function createPrismaTenantRepositories(prisma: PrismaClientOrTx): TenantRepositories {
  return {
    organizations: createPrismaOrganizationRepository(prisma),
    memberships: createPrismaMembershipRepository(prisma),
    documents: createPrismaDocumentRepository(prisma),
    revisions: createPrismaDocumentRevisionRepository(prisma),
    uploadSessions: createPrismaUploadSessionRepository(prisma),
    previewGrants: createPrismaPreviewGrantRepository(prisma),
    signers: createPrismaSignerRepository(prisma),
    signingSessions: createPrismaSigningSessionRepository(prisma),
    signatureFields: createPrismaSignatureFieldRepository(prisma),
    consentRecords: createPrismaConsentRecordRepository(prisma),
    finalizedArtifacts: createPrismaFinalizedArtifactRepository(prisma),
    auditLogs: createPrismaAuditLogRepository(prisma),
    outboxEvents: createPrismaOutboxEventRepository(prisma),
    backgroundJobs: createPrismaBackgroundJobRepository(prisma),
    idempotencyRecords: createPrismaIdempotencyRecordRepository(prisma),
  };
}
