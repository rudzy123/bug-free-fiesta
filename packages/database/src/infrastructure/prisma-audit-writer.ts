import {
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  requireOpaqueId,
  requireOrganizationId,
  type AuditWriter,
} from '@esign/domain';
import { Prisma } from '../generated/client/index.js';
import { AUDIT_ACTOR_TYPE_DB, AUDIT_EVENT_TYPE_DB, computeAuditEventHash } from '../digest.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  AUDIT_ACTOR_TYPE_TO_PRISMA,
  AUDIT_EVENT_TYPE_TO_PRISMA,
  toDomainAuditEvent,
} from './prisma-mappers.js';

export function createPrismaAuditWriter(prisma: PrismaClientOrTx): AuditWriter {
  return {
    async append(input) {
      const organizationId = requireOrganizationId(input.organizationId);
      const documentId = requireOpaqueId(input.documentId, 'documentId');
      const latest = await prisma.auditLog.findFirst({
        where: { organizationId, documentId },
        orderBy: { sequence: 'desc' },
      });
      const sequence = latest ? latest.sequence + 1 : 0;
      const previousEventHash = latest?.eventHash ?? AUDIT_GENESIS_PREVIOUS_EVENT_HASH;
      const prismaType = AUDIT_EVENT_TYPE_TO_PRISMA[input.type];
      const prismaActorType = AUDIT_ACTOR_TYPE_TO_PRISMA[input.actorType];
      const payload = input.payload as Prisma.InputJsonValue;
      const eventHash = computeAuditEventHash({
        previousEventHash,
        sequence,
        type: AUDIT_EVENT_TYPE_DB[prismaType],
        actorType: AUDIT_ACTOR_TYPE_DB[prismaActorType],
        actorId: input.actorId,
        occurredAt: input.occurredAt,
        payload,
      });
      const row = await prisma.auditLog.create({
        data: {
          id: input.id,
          organizationId,
          documentId,
          sequence,
          type: prismaType,
          actorType: prismaActorType,
          actorId: input.actorId,
          occurredAt: input.occurredAt,
          payload,
          previousEventHash,
          eventHash,
          requestId: input.requestId ?? null,
        },
      });
      return toDomainAuditEvent(row);
    },
  };
}
