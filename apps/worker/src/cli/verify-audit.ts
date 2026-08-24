import { loadWorkerConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createPrismaClient, createPrismaTenantRepositories } from '@esign/database';
import {
  createConfiguredCheckpointStore,
  createLoggingAuditVerificationAlertSink,
  createMembershipAuthorizationPolicy,
  createMemoryAuditVerificationMetrics,
  createObjectStorageDriver,
  createSha256Hashing,
  createSizeLimitedObjectStorage,
  createSystemClock,
  createVerifyOrganizationAuditChains,
} from '@esign/application';
import { parseVerifyAuditArgs } from './verify-audit-args.js';

export async function runVerifyAuditCli(argv: readonly string[]): Promise<void> {
  const args = parseVerifyAuditArgs(argv);
  const config = loadWorkerConfig();
  const logger = createLogger({ name: 'verify-audit', level: config.LOG_LEVEL });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const hashing = createSha256Hashing();
  const storage = createSizeLimitedObjectStorage(
    createObjectStorageDriver({
      driver: config.OBJECT_STORAGE_DRIVER,
      fsRoot: config.OBJECT_STORAGE_FS_ROOT,
    }),
    config.DOCUMENT_MAX_UPLOAD_BYTES,
  );
  const repos = createPrismaTenantRepositories(prisma);
  const clock = createSystemClock();
  const verifyOrganization = createVerifyOrganizationAuditChains({
    authorization: createMembershipAuthorizationPolicy(),
    documents: repos.documents,
    auditLogs: repos.auditLogs,
    artifacts: repos.finalizedArtifacts,
    storage,
    hashing,
    clock,
    checkpoints: createConfiguredCheckpointStore({
      name: config.AUDIT_CHECKPOINT_STORE,
      storage,
      hashing,
    }),
    metrics: createMemoryAuditVerificationMetrics(),
    alerts: createLoggingAuditVerificationAlertSink({
      error: (fields, message) => logger.error(fields, message),
    }),
  });
  try {
    const report = await verifyOrganization({
      organizationId: args.organizationId,
      documentId: args.documentId,
      actor: { type: 'system' },
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1]?.includes('verify-audit') === true;
if (invokedDirectly) {
  await runVerifyAuditCli(process.argv.slice(2));
}
