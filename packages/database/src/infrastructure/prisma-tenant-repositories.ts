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
import {
  OutboxStatus,
  Prisma,
  SigningSessionStatus,
  UploadSessionStatus,
} from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  AUDIT_ACTOR_TYPE_TO_PRISMA,
  AUDIT_EVENT_TYPE_TO_PRISMA,
  DOCUMENT_INSPECTION_STATUS_TO_PRISMA,
  DOCUMENT_STATE_TO_PRISMA,
  FIELD_TYPE_TO_PRISMA,
  IDEMPOTENCY_PRINCIPAL_TO_PRISMA,
  REVISION_KIND_TO_PRISMA,
  SESSION_STATUS_TO_PRISMA,
  SIGNER_STATUS_TO_PRISMA,
  SIGNING_MODE_TO_PRISMA,
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

async function requireDocument(
  prisma: PrismaClientOrTx,
  organizationId: string,
  documentId: string,
) {
  const row = await prisma.document.findUnique({
    where: tenantCompoundWhere(organizationId, documentId, 'documentId'),
  });
  if (!row) {
    throw new NotFoundError({ resource: 'document' });
  }
  return toDomainDocument(row);
}

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
          signingMode: SIGNING_MODE_TO_PRISMA[input.document.signingMode],
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
    async setSigningMode(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: { organizationId, id: documentId, version: input.expectedVersion },
        data: {
          signingMode: SIGNING_MODE_TO_PRISMA[input.signingMode],
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
    async setPreparationState(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: { organizationId, id: documentId, version: input.expectedVersion },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA[input.state],
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
    async markSent(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: { organizationId, id: documentId, version: input.expectedVersion },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.sent,
          signingRevisionId: input.signingRevisionId,
          expiresAt: input.expiresAt,
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
    async markDeclined(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          state: { in: [DOCUMENT_STATE_TO_PRISMA.sent, DOCUMENT_STATE_TO_PRISMA.in_progress] },
        },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.declined,
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
    async markVoided(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          state: {
            in: [
              DOCUMENT_STATE_TO_PRISMA.draft,
              DOCUMENT_STATE_TO_PRISMA.prepared,
              DOCUMENT_STATE_TO_PRISMA.sent,
              DOCUMENT_STATE_TO_PRISMA.in_progress,
            ],
          },
        },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.voided,
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
    async markInProgress(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          state: { in: [DOCUMENT_STATE_TO_PRISMA.sent, DOCUMENT_STATE_TO_PRISMA.in_progress] },
        },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.in_progress,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_version' });
      }
      return requireDocument(prisma, organizationId, documentId);
    },
    async markCompleted(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          state: { in: [DOCUMENT_STATE_TO_PRISMA.sent, DOCUMENT_STATE_TO_PRISMA.in_progress] },
        },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.completed,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_version' });
      }
      return requireDocument(prisma, organizationId, documentId);
    },
    async claimProcessingLease(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const current = await prisma.document.findFirst({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          state: {
            in: [
              DOCUMENT_STATE_TO_PRISMA.sent,
              DOCUMENT_STATE_TO_PRISMA.in_progress,
              DOCUMENT_STATE_TO_PRISMA.completed,
              DOCUMENT_STATE_TO_PRISMA.finalization_failed,
              DOCUMENT_STATE_TO_PRISMA.finalizing,
            ],
          },
          OR: [
            { leaseUntil: null },
            { leaseUntil: { lt: input.now } },
            { leaseOwner: input.owner },
          ],
        },
      });
      if (!current) {
        throw new ConflictError({ reason: 'document_lease', code: 'CONCURRENT_FINALIZATION' });
      }
      const nextState =
        current.state === DOCUMENT_STATE_TO_PRISMA.completed ||
        current.state === DOCUMENT_STATE_TO_PRISMA.finalization_failed
          ? DOCUMENT_STATE_TO_PRISMA.finalizing
          : current.state === DOCUMENT_STATE_TO_PRISMA.sent
            ? DOCUMENT_STATE_TO_PRISMA.in_progress
            : current.state;
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          OR: [
            { leaseUntil: null },
            { leaseUntil: { lt: input.now } },
            { leaseOwner: input.owner },
          ],
        },
        data: {
          state: nextState,
          leaseOwner: input.owner,
          leaseUntil: input.leaseUntil,
          finalizationAttemptCount:
            nextState === DOCUMENT_STATE_TO_PRISMA.finalizing
              ? { increment: 1 }
              : current.finalizationAttemptCount,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_lease', code: 'CONCURRENT_FINALIZATION' });
      }
      return requireDocument(prisma, organizationId, documentId);
    },
    async commitFlattenedRevision(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const result = await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          version: input.expectedVersion,
          leaseOwner: input.owner,
        },
        data: input.finalize
          ? {
              state: DOCUMENT_STATE_TO_PRISMA.finalized,
              currentRevisionId: input.revisionId,
              leaseOwner: null,
              leaseUntil: null,
              version: { increment: 1 },
            }
          : {
              currentRevisionId: input.revisionId,
              leaseOwner: null,
              leaseUntil: null,
              version: { increment: 1 },
            },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'document_lease', code: 'CONCURRENT_FINALIZATION' });
      }
      return requireDocument(prisma, organizationId, documentId);
    },
    async markFinalizationFailed(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      await prisma.document.updateMany({
        where: {
          organizationId,
          id: documentId,
          leaseOwner: input.owner,
          state: DOCUMENT_STATE_TO_PRISMA.finalizing,
        },
        data: {
          state: DOCUMENT_STATE_TO_PRISMA.finalization_failed,
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
      return requireDocument(prisma, organizationId, documentId);
    },
    async releaseProcessingLease(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      await prisma.document.updateMany({
        where: { organizationId, id: documentId, leaseOwner: input.owner },
        data: {
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });
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
          pageCount: input.revision.pageCount,
          createdAt: input.revision.createdAt,
        },
      });
      return toDomainRevision(row);
    },
    async findFirstByObjectKey(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.documentRevision.findFirst({
        where: { organizationId, objectKey: input.objectKey },
      });
      return row ? toDomainRevision(row) : null;
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
    async replaceAll(input) {
      assertSameOrganization(input.organizationId, input.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const nextIds = input.signers.map((signer) => signer.id);
      await prisma.signatureField.deleteMany({
        where: { organizationId, documentId, signerId: { notIn: nextIds } },
      });
      await prisma.signer.deleteMany({
        where: { organizationId, documentId, id: { notIn: nextIds } },
      });
      const stored = [];
      for (const signer of input.signers) {
        assertSameOrganization(organizationId, signer.organizationId);
        const row = await prisma.signer.upsert({
          where: tenantCompoundWhere(organizationId, signer.id, 'signerId'),
          create: {
            id: signer.id,
            organizationId,
            documentId,
            accountUserId: signer.accountUserId,
            routingOrder: signer.routingOrder,
            status: SIGNER_STATUS_TO_PRISMA[signer.status],
            email: signer.email,
            displayName: signer.displayName,
            version: signer.version,
            completedAt: signer.completedAt,
            declinedAt: signer.declinedAt,
            createdAt: signer.createdAt,
            updatedAt: signer.updatedAt,
          },
          update: {
            routingOrder: signer.routingOrder,
            email: signer.email,
            displayName: signer.displayName,
            updatedAt: signer.updatedAt,
          },
        });
        stored.push(toDomainSigner(row));
      }
      return stored;
    },
    async markDeclined(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const signerId = requireOpaqueId(input.signerId, 'signerId');
      const result = await prisma.signer.updateMany({
        where: {
          organizationId,
          id: signerId,
          version: input.expectedVersion,
          status: SIGNER_STATUS_TO_PRISMA.pending,
        },
        data: {
          status: SIGNER_STATUS_TO_PRISMA.declined,
          declinedAt: input.declinedAt,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'signer_version' });
      }
      const row = await prisma.signer.findUnique({
        where: tenantCompoundWhere(organizationId, signerId, 'signerId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signer' });
      }
      return toDomainSigner(row);
    },
    async markSigned(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const signerId = requireOpaqueId(input.signerId, 'signerId');
      const existing = await prisma.signer.findUnique({
        where: tenantCompoundWhere(organizationId, signerId, 'signerId'),
      });
      if (existing?.status === SIGNER_STATUS_TO_PRISMA.signed) {
        return toDomainSigner(existing);
      }
      const result = await prisma.signer.updateMany({
        where: {
          organizationId,
          id: signerId,
          version: input.expectedVersion,
          status: SIGNER_STATUS_TO_PRISMA.pending,
        },
        data: {
          status: SIGNER_STATUS_TO_PRISMA.signed,
          completedAt: input.completedAt,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'signer_version' });
      }
      const row = await prisma.signer.findUnique({
        where: tenantCompoundWhere(organizationId, signerId, 'signerId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signer' });
      }
      return toDomainSigner(row);
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
    async listByDocument(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const rows = await prisma.signingSession.findMany({
        where: { organizationId, documentId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toDomainSigningSession);
    },
    async listOpenBySigner(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const signerId = requireOpaqueId(input.signerId, 'signerId');
      const rows = await prisma.signingSession.findMany({
        where: {
          organizationId,
          signerId,
          status: { in: [SigningSessionStatus.issued, SigningSessionStatus.active] },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toDomainSigningSession);
    },
    async create(input) {
      assertSameOrganization(input.organizationId, input.session.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.signingSession.create({
        data: {
          id: input.session.id,
          organizationId,
          documentId: input.session.documentId,
          signerId: input.session.signerId,
          tokenHash: input.session.tokenHash,
          csrfTokenHash: input.session.csrfTokenHash,
          status: SESSION_STATUS_TO_PRISMA[input.session.status],
          expiresAt: input.session.expiresAt,
          consumedAt: input.session.consumedAt,
          completedAt: input.session.completedAt,
          revokedAt: input.session.revokedAt,
          presentationAttemptCount: input.session.presentationAttemptCount,
          failedPresentationCount: input.session.failedPresentationCount,
          lastPresentedAt: input.session.lastPresentedAt,
          requestId: input.session.requestId,
          version: input.session.version,
          createdAt: input.session.createdAt,
          updatedAt: input.session.updatedAt,
        },
      });
      return toDomainSigningSession(row);
    },
    async revoke(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const result = await prisma.signingSession.updateMany({
        where: {
          organizationId,
          id: sessionId,
          status: { in: [SigningSessionStatus.issued, SigningSessionStatus.active] },
        },
        data: {
          status: SigningSessionStatus.revoked,
          revokedAt: input.revokedAt,
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'session_not_open' });
      }
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      return toDomainSigningSession(row);
    },
    async markPresented(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const result = await prisma.signingSession.updateMany({
        where: { organizationId, id: sessionId, status: SigningSessionStatus.issued },
        data: {
          status: SigningSessionStatus.active,
          lastPresentedAt: input.presentedAt,
        },
      });
      if (result.count !== 1) {
        const existing = await prisma.signingSession.findUnique({
          where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
        });
        if (!existing) {
          throw new NotFoundError({ resource: 'signing_session' });
        }
        if (existing.status === SigningSessionStatus.active) {
          await prisma.signingSession.updateMany({
            where: { organizationId, id: sessionId },
            data: { lastPresentedAt: input.presentedAt },
          });
          const row = await prisma.signingSession.findUnique({
            where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
          });
          if (!row) {
            throw new NotFoundError({ resource: 'signing_session' });
          }
          return toDomainSigningSession(row);
        }
        throw new ConflictError({ reason: 'session_not_presentable', status: existing.status });
      }
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      return toDomainSigningSession(row);
    },
    async markExpired(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const result = await prisma.signingSession.updateMany({
        where: {
          organizationId,
          id: sessionId,
          status: { in: [SigningSessionStatus.issued, SigningSessionStatus.active] },
        },
        data: { status: SigningSessionStatus.expired },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'session_not_open' });
      }
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      return toDomainSigningSession(row);
    },
    async consumeAndRotate(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const result = await prisma.signingSession.updateMany({
        where: {
          organizationId,
          id: sessionId,
          version: input.expectedVersion,
          consumedAt: null,
          status: { in: [SigningSessionStatus.issued, SigningSessionStatus.active] },
        },
        data: {
          tokenHash: input.tokenHash,
          csrfTokenHash: input.csrfTokenHash,
          consumedAt: input.consumedAt,
          status: SigningSessionStatus.active,
          lastPresentedAt: input.consumedAt,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'session_not_exchangeable' });
      }
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      return toDomainSigningSession(row);
    },
    async markCompleted(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const existing = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (existing?.status === SigningSessionStatus.completed) {
        return toDomainSigningSession(existing);
      }
      const result = await prisma.signingSession.updateMany({
        where: {
          organizationId,
          id: sessionId,
          status: { in: [SigningSessionStatus.issued, SigningSessionStatus.active] },
        },
        data: {
          status: SigningSessionStatus.completed,
          completedAt: input.completedAt,
        },
      });
      if (result.count !== 1) {
        throw new ConflictError({ reason: 'session_not_completable' });
      }
      const row = await prisma.signingSession.findUnique({
        where: tenantCompoundWhere(organizationId, sessionId, 'sessionId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      return toDomainSigningSession(row);
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
    async replaceAll(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      await prisma.signatureField.deleteMany({ where: { organizationId, documentId } });
      const stored = [];
      for (const field of input.fields) {
        assertSameOrganization(organizationId, field.organizationId);
        const row = await prisma.signatureField.create({
          data: {
            id: field.id,
            organizationId,
            documentId,
            signerId: field.signerId,
            type: FIELD_TYPE_TO_PRISMA[field.type],
            pageNumber: field.pageNumber,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            required: field.required,
            completedAt: field.completedAt,
            completionObjectKey: field.completionObjectKey,
            completionContentType: field.completionContentType,
            completionSizeBytes: field.completionSizeBytes,
            completionSha256Digest: field.completionSha256Digest,
            flattenedRevisionId: field.flattenedRevisionId,
            createdAt: field.createdAt,
            updatedAt: field.updatedAt,
          },
        });
        stored.push(toDomainSignatureField(row));
      }
      return stored;
    },
    async complete(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const fieldId = requireOpaqueId(input.fieldId, 'fieldId');
      const result = await prisma.signatureField.updateMany({
        where: { organizationId, id: fieldId },
        data: {
          completedAt: input.completedAt,
          completionObjectKey: input.completionObjectKey,
          completionContentType: input.completionContentType,
          completionSizeBytes: input.completionSizeBytes,
          completionSha256Digest: input.completionSha256Digest,
        },
      });
      if (result.count !== 1) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      const row = await prisma.signatureField.findUnique({
        where: tenantCompoundWhere(organizationId, fieldId, 'fieldId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      return toDomainSignatureField(row);
    },
    async markFlattened(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const fieldId = requireOpaqueId(input.fieldId, 'fieldId');
      const result = await prisma.signatureField.updateMany({
        where: { organizationId, id: fieldId },
        data: { flattenedRevisionId: input.flattenedRevisionId },
      });
      if (result.count !== 1) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      const row = await prisma.signatureField.findUnique({
        where: tenantCompoundWhere(organizationId, fieldId, 'fieldId'),
      });
      if (!row) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      return toDomainSignatureField(row);
    },
    async findFirstByCompletionObjectKey(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.signatureField.findFirst({
        where: { organizationId, completionObjectKey: input.objectKey },
      });
      return row ? toDomainSignatureField(row) : null;
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
    async findBySession(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const row = await prisma.consentRecord.findFirst({
        where: { organizationId, sessionId },
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
    async create(input) {
      assertSameOrganization(input.organizationId, input.consent.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      try {
        const row = await prisma.consentRecord.create({
          data: {
            id: input.consent.id,
            organizationId,
            documentId: input.consent.documentId,
            signerId: input.consent.signerId,
            sessionId: input.consent.sessionId,
            consentCopyId: input.consent.consentCopyId,
            acceptedAt: input.consent.acceptedAt,
            requestId: input.consent.requestId,
            untrustedClientIp: input.consent.untrustedClientIp,
            untrustedUserAgent: input.consent.untrustedUserAgent,
            createdAt: input.consent.createdAt,
          },
        });
        return toDomainConsent(row);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError({ reason: 'consent_exists' });
        }
        throw error;
      }
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
    async create(input) {
      assertSameOrganization(input.organizationId, input.artifact.organizationId);
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.finalizedArtifact.create({
        data: {
          id: input.artifact.id,
          organizationId,
          documentId: input.artifact.documentId,
          objectKey: input.artifact.objectKey,
          contentType: input.artifact.contentType,
          sizeBytes: input.artifact.sizeBytes,
          sha256Digest: input.artifact.sha256Digest,
          createdAt: input.artifact.createdAt,
        },
      });
      return toDomainArtifact(row);
    },
    async findFirstByObjectKey(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const row = await prisma.finalizedArtifact.findFirst({
        where: { organizationId, objectKey: input.objectKey },
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
