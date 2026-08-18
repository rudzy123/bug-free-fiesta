import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from './generated/client/index.js';
import { createPrismaClient } from './index.js';
import {
  createDocumentRevision,
  createFinalizedArtifact,
  createIdempotencyRecord,
  createMembership,
  createSignatureField,
  createSigner,
  createSigningSession,
  createTenantDocumentGraph,
  createAuditLog,
} from './factories.js';
import { SigningSessionStatus } from './generated/client/index.js';

const runInfraTests = process.env.RUN_INFRA_TESTS === 'true';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://esign:esign_dev_password@localhost:5432/esign';

function isCheckViolation(error: unknown, constraint: string): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes(constraint);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

describe.skipIf(!runInfraTests)('data model constraints', () => {
  const prisma = createPrismaClient(databaseUrl);

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a SHA-256 digest that is not 64 lowercase hex characters', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await expect(
      createDocumentRevision(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        sha256Digest: 'not-a-sha256',
      }),
    ).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'document_revisions_sha256_hex'),
    );
  });

  it('rejects a non-positive revision file size', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await expect(
      createDocumentRevision(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        sizeBytes: 0n,
      }),
    ).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'document_revisions_positive_size'),
    );
  });

  it('rejects signature-field coordinates outside the normalized page box', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const signer = await createSigner(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
    });
    await expect(
      createSignatureField(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        signerId: signer.id,
        x: '0.90',
        width: '0.20',
      }),
    ).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'signature_fields_normalized_box'),
    );
  });

  it('rejects a page index below 1', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const signer = await createSigner(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
    });
    await expect(
      createSignatureField(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        signerId: signer.id,
        pageNumber: 0,
      }),
    ).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'signature_fields_page_number'),
    );
  });

  it('rejects a negative signing order', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await expect(
      createSigner(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        routingOrder: -1,
      }),
    ).rejects.toSatisfy((error: unknown) =>
      isCheckViolation(error, 'signers_nonnegative_routing_order'),
    );
  });
});

describe.skipIf(!runInfraTests)('uniqueness', () => {
  const prisma = createPrismaClient(databaseUrl);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a second membership for the same user in the same organization', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await expect(
      createMembership(prisma, {
        organizationId: graph.organization.id,
        userId: graph.user.id,
      }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects a second finalized artifact for the same document', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await createFinalizedArtifact(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      label: 'artifact-one',
    });
    await expect(
      createFinalizedArtifact(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        label: 'artifact-two',
      }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects a duplicate idempotency key for the same organization principal and route', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    await createIdempotencyRecord(prisma, {
      organizationId: graph.organization.id,
      principalId: graph.user.id,
      key: 'same-key',
      route: 'POST /v1/documents/send',
    });
    await expect(
      createIdempotencyRecord(prisma, {
        organizationId: graph.organization.id,
        principalId: graph.user.id,
        key: 'same-key',
        route: 'POST /v1/documents/send',
      }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects a second issued or active signing session for the same signer', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const signer = await createSigner(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
    });
    await createSigningSession(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      signerId: signer.id,
      status: SigningSessionStatus.issued,
    });
    await expect(
      createSigningSession(prisma, {
        organizationId: graph.organization.id,
        documentId: graph.document.id,
        signerId: signer.id,
        status: SigningSessionStatus.active,
      }),
    ).rejects.toSatisfy(isUniqueViolation);
  });
});

describe.skipIf(!runInfraTests)('append-only audit', () => {
  const prisma = createPrismaClient(databaseUrl);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows insert and rejects update and delete', async () => {
    const graph = await createTenantDocumentGraph(prisma);
    const event = await createAuditLog(prisma, {
      organizationId: graph.organization.id,
      documentId: graph.document.id,
      actorId: graph.user.id,
    });

    await expect(
      prisma.auditLog.update({
        where: { id: event.id },
        data: { actorId: graph.user.id },
      }),
    ).rejects.toThrow(/audit_logs are append-only/);

    await expect(prisma.auditLog.delete({ where: { id: event.id } })).rejects.toThrow(
      /audit_logs are append-only/,
    );

    const persisted = await prisma.auditLog.findUnique({ where: { id: event.id } });
    expect(persisted?.id).toBe(event.id);
    expect(persisted?.sequence).toBe(0);
  });

  it('rejects update and delete on account security events', async () => {
    const event = await prisma.accountSecurityEvent.create({
      data: {
        id: crypto.randomUUID(),
        type: 'loginFailed',
        occurredAt: new Date('2026-08-18T12:00:00.000Z'),
        payload: { provider: 'local' },
      },
    });

    await expect(
      prisma.accountSecurityEvent.update({
        where: { id: event.id },
        data: { type: 'logout' },
      }),
    ).rejects.toThrow(/account_security_events are append-only/);

    await expect(prisma.accountSecurityEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /account_security_events are append-only/,
    );
  });
});

describe.skipIf(!runInfraTests)('tenant separation', () => {
  const prisma = createPrismaClient(databaseUrl);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not return another organization document when scoped by organizationId', async () => {
    const north = await createTenantDocumentGraph(prisma, { organizationName: 'North' });
    const south = await createTenantDocumentGraph(prisma, { organizationName: 'South' });

    const northDocuments = await prisma.document.findMany({
      where: { organizationId: north.organization.id },
    });
    expect(northDocuments.map((row) => row.id)).toEqual([north.document.id]);
    expect(northDocuments.map((row) => row.id)).not.toContain(south.document.id);
  });

  it('rejects a signer whose organizationId does not match the document tenant', async () => {
    const north = await createTenantDocumentGraph(prisma, { organizationName: 'North FK' });
    const south = await createTenantDocumentGraph(prisma, { organizationName: 'South FK' });

    await expect(
      createSigner(prisma, {
        organizationId: south.organization.id,
        documentId: north.document.id,
      }),
    ).rejects.toSatisfy(isForeignKeyViolation);
  });
});
