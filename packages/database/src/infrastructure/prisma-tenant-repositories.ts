import {
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
  type SignatureFieldRepository,
  type SignerRepository,
  type SigningSessionRepository,
  type TenantRepositories,
  type UserRepository,
} from '@esign/domain';
import { OutboxStatus } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  AUDIT_ACTOR_TYPE_TO_PRISMA,
  AUDIT_EVENT_TYPE_TO_PRISMA,
  DOCUMENT_STATE_TO_PRISMA,
  toDomainArtifact,
  toDomainAuditEvent,
  toDomainBackgroundJob,
  toDomainConsent,
  toDomainDocument,
  toDomainIdempotency,
  toDomainMembership,
  toDomainOrganization,
  toDomainOutboxEvent,
  toDomainRevision,
  toDomainSignatureField,
  toDomainSigner,
  toDomainSigningSession,
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
  };
}

export function createPrismaTenantRepositories(prisma: PrismaClientOrTx): TenantRepositories {
  return {
    organizations: createPrismaOrganizationRepository(prisma),
    memberships: createPrismaMembershipRepository(prisma),
    documents: createPrismaDocumentRepository(prisma),
    revisions: createPrismaDocumentRevisionRepository(prisma),
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
