import { PrismaClient } from './generated/client/index.js';

export { PrismaClient };
export {
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
} from './generated/client/index.js';

export {
  AUDIT_ACTOR_TYPE_DB,
  AUDIT_EVENT_TYPE_DB,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  computeAuditEventHash,
  sha256Hex,
  syntheticSha256,
} from './digest.js';
export { seedIds } from './seed-ids.js';

export type DatabasePinger = {
  ping: () => Promise<void>;
};

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export function createPrismaPinger(client: PrismaClient): DatabasePinger {
  return {
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
