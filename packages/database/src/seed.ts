import { createPrismaClient } from './index.js';
import {
  DocumentInspectionStatus,
  DocumentState,
  MembershipRole,
  SignerStatus,
  SigningSessionStatus,
} from './generated/client/index.js';
import { syntheticSha256 } from './digest.js';
import {
  createAuditLog,
  createBackgroundJob,
  createDocument,
  createDocumentRevision,
  createIdempotencyRecord,
  createMembership,
  createOrganization,
  createOutboxEvent,
  createSignatureField,
  createSigner,
  createSigningSession,
  createUser,
} from './factories.js';
import { seedIds } from './seed-ids.js';

/**
 * Deterministic development seed. Synthetic emails only.
 * DATABASE_URL is read here because Prisma seed is a CLI exception, same as migrate.
 */
async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed. Copy packages/database/.env.example.');
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const existing = await prisma.organization.findUnique({ where: { id: seedIds.orgNorth } });
    if (existing) {
      process.stdout.write('Seed already applied; skipping.\n');
      return;
    }

    await createOrganization(prisma, { id: seedIds.orgNorth, name: 'North Example Org' });
    await createOrganization(prisma, { id: seedIds.orgSouth, name: 'South Example Org' });
    await createUser(prisma, {
      id: seedIds.userAda,
      email: 'ada@example.test',
      displayName: 'Ada Example',
    });
    await createUser(prisma, {
      id: seedIds.userBeau,
      email: 'beau@example.test',
      displayName: 'Beau Example',
    });
    await createUser(prisma, {
      id: seedIds.userCora,
      email: 'cora@example.test',
      displayName: 'Cora Example',
    });
    await createMembership(prisma, {
      id: seedIds.membershipNorthAda,
      organizationId: seedIds.orgNorth,
      userId: seedIds.userAda,
      role: MembershipRole.owner,
    });
    await createMembership(prisma, {
      id: seedIds.membershipSouthAda,
      organizationId: seedIds.orgSouth,
      userId: seedIds.userAda,
      role: MembershipRole.member,
    });
    await createMembership(prisma, {
      id: seedIds.membershipSouthBeau,
      organizationId: seedIds.orgSouth,
      userId: seedIds.userBeau,
      role: MembershipRole.owner,
    });
    await createMembership(prisma, {
      id: seedIds.membershipSouthCora,
      organizationId: seedIds.orgSouth,
      userId: seedIds.userCora,
      role: MembershipRole.readOnly,
    });

    await createDocument(prisma, {
      id: seedIds.documentNorth,
      organizationId: seedIds.orgNorth,
      ownerMembershipId: seedIds.membershipNorthAda,
      title: 'North draft NDA',
      state: DocumentState.draft,
    });
    const northRevision = await createDocumentRevision(prisma, {
      id: seedIds.revisionNorth,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      label: 'north-source',
    });
    await prisma.document.update({
      where: { id: seedIds.documentNorth },
      data: {
        currentRevisionId: northRevision.id,
        inspectionStatus: DocumentInspectionStatus.accepted,
        sourceDisplayName: 'north-source.pdf',
      },
    });

    await createSigner(prisma, {
      id: seedIds.signerNorthA,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      routingOrder: 1,
      email: 'signer-a@example.test',
      displayName: 'Signer A',
    });
    await createSigner(prisma, {
      id: seedIds.signerNorthB,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      routingOrder: 1,
      email: 'signer-b@example.test',
      displayName: 'Signer B',
    });
    await createSignatureField(prisma, {
      id: seedIds.fieldNorthA,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      signerId: seedIds.signerNorthA,
      x: '0.10',
    });
    await createSignatureField(prisma, {
      id: seedIds.fieldNorthB,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      signerId: seedIds.signerNorthB,
      x: '0.50',
    });
    await createSigningSession(prisma, {
      id: seedIds.sessionNorthA,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      signerId: seedIds.signerNorthA,
      tokenHash: syntheticSha256('seed-token-north-a'),
      status: SigningSessionStatus.issued,
      requestId: seedIds.requestNorth,
    });
    await createAuditLog(prisma, {
      id: seedIds.auditNorth,
      organizationId: seedIds.orgNorth,
      documentId: seedIds.documentNorth,
      actorId: seedIds.userAda,
      requestId: seedIds.requestNorth,
    });
    await createIdempotencyRecord(prisma, {
      id: seedIds.idempotencyNorth,
      organizationId: seedIds.orgNorth,
      principalId: seedIds.userAda,
      key: 'seed-send-north',
      requestId: seedIds.requestNorth,
    });

    await createDocument(prisma, {
      id: seedIds.documentSouth,
      organizationId: seedIds.orgSouth,
      ownerMembershipId: seedIds.membershipSouthBeau,
      title: 'South sent agreement',
      state: DocumentState.sent,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    const southRevision = await createDocumentRevision(prisma, {
      id: seedIds.revisionSouth,
      organizationId: seedIds.orgSouth,
      documentId: seedIds.documentSouth,
      label: 'south-source',
    });
    await prisma.document.update({
      where: { id: seedIds.documentSouth },
      data: {
        currentRevisionId: southRevision.id,
        signingRevisionId: southRevision.id,
        inspectionStatus: DocumentInspectionStatus.accepted,
        sourceDisplayName: 'south-source.pdf',
      },
    });
    await createSigner(prisma, {
      id: seedIds.signerSouth,
      organizationId: seedIds.orgSouth,
      documentId: seedIds.documentSouth,
      routingOrder: 1,
      status: SignerStatus.pending,
      email: 'south-signer@example.test',
      displayName: 'South Signer',
    });
    const outbox = await createOutboxEvent(prisma, {
      id: seedIds.outboxSouth,
      organizationId: seedIds.orgSouth,
      documentId: seedIds.documentSouth,
      type: 'send_invitation',
    });
    await createBackgroundJob(prisma, {
      id: seedIds.jobSouth,
      organizationId: seedIds.orgSouth,
      documentId: seedIds.documentSouth,
      outboxEventId: outbox.id,
      type: 'send_invitation',
    });

    process.stdout.write('Seeded North and South example organizations.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
