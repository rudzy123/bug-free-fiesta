import { createPrismaClient } from '@esign/database';
import { pollUntil } from '@esign/test-utils';
import { e2eApiEnv } from '../env';

const OPAQUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireOpaqueId(value: string): string {
  if (!OPAQUE_ID.test(value)) {
    throw new Error('expected an opaque UUID');
  }
  return value;
}

function databaseUrl(): string {
  const url = e2eApiEnv()['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL missing from e2e environment');
  }
  return url;
}

export async function expireSigningSession(sessionId: string): Promise<void> {
  const prisma = createPrismaClient(databaseUrl());
  try {
    await prisma.signingSession.update({
      where: { id: requireOpaqueId(sessionId) },
      data: { expiresAt: new Date('2000-01-01T00:00:00.000Z') },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function waitForInspectRetry(documentId: string): Promise<void> {
  const id = requireOpaqueId(documentId);
  const prisma = createPrismaClient(databaseUrl());
  try {
    await pollUntil(
      async () =>
        prisma.backgroundJob.findFirst({
          where: { documentId: id, type: 'inspect_document' },
          orderBy: { createdAt: 'desc' },
        }),
      (job) =>
        job !== null &&
        (job.attemptCount >= 1 || job.lastErrorCode !== null || job.status === 'failed'),
      {
        timeoutMs: 20_000,
        intervalMs: 200,
        message: 'inspect job did not record a retryable failure',
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function withAuditInsertFailure(
  documentId: string,
  run: () => Promise<void>,
): Promise<void> {
  const id = requireOpaqueId(documentId);
  const suffix = id.replaceAll('-', '');
  const fn = `e2e_fail_audit_${suffix}`;
  const prisma = createPrismaClient(databaseUrl());
  try {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$
      BEGIN
        IF NEW."documentId" = '${id}'::uuid THEN
          RAISE EXCEPTION 'e2e injected transaction failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON audit_logs`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    await run();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON audit_logs`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    await prisma.$disconnect();
  }
}

export async function corruptDocumentAuditHash(documentId: string): Promise<void> {
  const prisma = createPrismaClient(databaseUrl());
  try {
    const latest = await prisma.auditLog.findFirst({
      where: { documentId: requireOpaqueId(documentId) },
      orderBy: { sequence: 'desc' },
    });
    if (latest === null) {
      throw new Error('no audit events to corrupt');
    }
    await prisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only`;
    try {
      await prisma.auditLog.update({
        where: { id: latest.id },
        data: { eventHash: 'f'.repeat(64) },
      });
    } finally {
      await prisma.$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only`;
    }
  } finally {
    await prisma.$disconnect();
  }
}
