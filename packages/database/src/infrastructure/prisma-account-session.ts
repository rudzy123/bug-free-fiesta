import {
  requireOpaqueId,
  type AccountSecurityAuditWriter,
  type AccountSessionRepository,
} from '@esign/domain';
import type { PrismaClientOrTx } from './prisma-client.js';
import {
  ACCOUNT_SECURITY_EVENT_TYPE_TO_PRISMA,
  asInputJson,
  toDomainAccountSession,
} from './prisma-mappers.js';

export function createPrismaAccountSessionRepository(
  prisma: PrismaClientOrTx,
): AccountSessionRepository {
  return {
    async create(session) {
      const row = await prisma.accountSession.create({
        data: {
          id: requireOpaqueId(session.id, 'sessionId'),
          userId: requireOpaqueId(session.userId, 'userId'),
          tokenHash: session.tokenHash,
          csrfTokenHash: session.csrfTokenHash,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
          createdAt: session.createdAt,
        },
      });
      return toDomainAccountSession(row);
    },
    async findByTokenHash(tokenHash) {
      const row = await prisma.accountSession.findUnique({
        where: { tokenHash },
      });
      return row ? toDomainAccountSession(row) : null;
    },
    async findById(input) {
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      const row = await prisma.accountSession.findUnique({
        where: { id: sessionId },
      });
      return row ? toDomainAccountSession(row) : null;
    },
    async revoke(input) {
      const sessionId = requireOpaqueId(input.sessionId, 'sessionId');
      await prisma.accountSession.update({
        where: { id: sessionId },
        data: { revokedAt: input.revokedAt },
      });
    },
  };
}

export function createPrismaAccountSecurityAuditWriter(
  prisma: PrismaClientOrTx,
): AccountSecurityAuditWriter {
  return {
    async append(event) {
      await prisma.accountSecurityEvent.create({
        data: {
          id: requireOpaqueId(event.id, 'eventId'),
          type: ACCOUNT_SECURITY_EVENT_TYPE_TO_PRISMA[event.type],
          actorUserId: event.actorUserId ?? null,
          sessionId: event.sessionId ?? null,
          requestId: event.requestId ?? null,
          occurredAt: event.occurredAt,
          payload: asInputJson(event.payload),
        },
      });
    },
  };
}
