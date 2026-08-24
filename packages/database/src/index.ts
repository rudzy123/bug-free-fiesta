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
  SigningMode,
  SigningSessionStatus,
} from './generated/client/index.js';

export {
  AUDIT_ACTOR_TYPE_DB,
  AUDIT_EVENT_TYPE_DB,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  AUDIT_CHAIN_SCHEMA_VERSION,
  computeAuditEventHash,
  sha256Hex,
  syntheticSha256,
} from './digest.js';
export { seedIds } from './seed-ids.js';

export type DatabasePinger = {
  ping: () => Promise<void>;
};

export type PrismaQueryMetricsSink = {
  readonly record: (input: {
    operation: string;
    outcome: 'ok' | 'error';
    durationSeconds: number;
  }) => void;
};

export type CreatePrismaClientOptions = {
  readonly queryMetrics?: PrismaQueryMetricsSink;
};

/**
 * Bounded Prisma operation label for metrics (model.verb or verb for raw).
 * Strips unexpected characters to keep Prometheus cardinality stable.
 */
export function prismaOperationLabel(model: string | undefined, operation: string): string {
  const verb = operation.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40) || 'unknown';
  if (model === undefined || model === '') {
    return verb;
  }
  const safeModel = model.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  return `${safeModel}.${verb}`;
}

export function createPrismaClient(
  databaseUrl: string,
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const sink = options.queryMetrics;
  if (sink === undefined) {
    return client;
  }
  const extended = client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const started = performance.now();
        const label = prismaOperationLabel(model, operation);
        try {
          const result = await query(args);
          sink.record({
            operation: label,
            outcome: 'ok',
            durationSeconds: (performance.now() - started) / 1000,
          });
          return result;
        } catch (error: unknown) {
          sink.record({
            operation: label,
            outcome: 'error',
            durationSeconds: (performance.now() - started) / 1000,
          });
          throw error;
        }
      },
    },
  });
  // Extended clients are structurally compatible for repository adapters.
  return extended as unknown as PrismaClient;
}

export function createPrismaPinger(client: PrismaClient): DatabasePinger {
  return {
    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}

export {
  createPrismaAuditWriter,
  createPrismaDocumentRepository,
  createPrismaJobPublisher,
  createPrismaMembershipRepository,
  createPrismaOrganizationRepository,
  createPrismaSignerRepository,
  createPrismaSigningTokenLookup,
  createPrismaTenantRepositories,
  createPrismaUnitOfWork,
  createPrismaUserRepository,
  createPrismaAccountSessionRepository,
  createPrismaAccountSecurityAuditWriter,
  createPrismaUploadSessionLookup,
  createPrismaPreviewGrantLookup,
  createPrismaOutboxClaimer,
  createPrismaJobQueueHealth,
} from './infrastructure/index.js';
export type { PrismaClientOrTx, OutboxClaimer } from './infrastructure/index.js';
