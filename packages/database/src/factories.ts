import type { PrismaClient } from './generated/client/index.js';
import {
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
import {
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  computeAuditEventHash,
  syntheticSha256,
  AUDIT_EVENT_TYPE_DB,
  AUDIT_ACTOR_TYPE_DB,
} from './digest.js';

function newId(): string {
  return crypto.randomUUID();
}

export async function createOrganization(
  prisma: PrismaClient,
  overrides: { id?: string; name?: string } = {},
) {
  return prisma.organization.create({
    data: {
      id: overrides.id ?? newId(),
      name: overrides.name ?? 'Example Organization',
    },
  });
}

export async function createUser(
  prisma: PrismaClient,
  overrides: { id?: string; email?: string; displayName?: string } = {},
) {
  const id = overrides.id ?? newId();
  return prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `user-${id}@example.test`,
      displayName: overrides.displayName ?? 'Example User',
    },
  });
}

export async function createMembership(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    id?: string;
    role?: MembershipRole;
  },
) {
  return prisma.organizationMembership.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role ?? MembershipRole.member,
    },
  });
}

export async function createDocument(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    ownerMembershipId: string;
    id?: string;
    title?: string;
    state?: DocumentState;
    expiresAt?: Date;
  },
) {
  return prisma.document.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      ownerMembershipId: input.ownerMembershipId,
      title: input.title ?? 'Example document',
      state: input.state ?? DocumentState.draft,
      expiresAt: input.expiresAt,
    },
  });
}

export async function createDocumentRevision(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    id?: string;
    kind?: DocumentRevisionKind;
    label?: string;
    objectKey?: string;
    contentType?: string;
    sizeBytes?: bigint;
    sha256Digest?: string;
    displayName?: string;
  },
) {
  const id = input.id ?? newId();
  const sha256Digest = input.sha256Digest ?? syntheticSha256(input.label ?? id);
  return prisma.documentRevision.create({
    data: {
      id,
      organizationId: input.organizationId,
      documentId: input.documentId,
      kind: input.kind ?? DocumentRevisionKind.source,
      objectKey: input.objectKey ?? `tenants/${input.organizationId}/revisions/${sha256Digest}`,
      contentType: input.contentType ?? 'application/pdf',
      sizeBytes: input.sizeBytes ?? 1024n,
      sha256Digest,
      displayName: input.displayName ?? 'document.pdf',
    },
  });
}

export async function createSigner(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    id?: string;
    accountUserId?: string;
    routingOrder?: number;
    status?: SignerStatus;
    email?: string;
    displayName?: string;
  },
) {
  const id = input.id ?? newId();
  return prisma.signer.create({
    data: {
      id,
      organizationId: input.organizationId,
      documentId: input.documentId,
      accountUserId: input.accountUserId,
      routingOrder: input.routingOrder ?? 1,
      status: input.status ?? SignerStatus.pending,
      email: input.email ?? `signer-${id}@example.test`,
      displayName: input.displayName ?? 'Example Signer',
    },
  });
}

export async function createSigningSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    signerId: string;
    id?: string;
    tokenHash?: string;
    status?: SigningSessionStatus;
    expiresAt?: Date;
    consumedAt?: Date;
    requestId?: string;
  },
) {
  const id = input.id ?? newId();
  return prisma.signingSession.create({
    data: {
      id,
      organizationId: input.organizationId,
      documentId: input.documentId,
      signerId: input.signerId,
      tokenHash: input.tokenHash ?? syntheticSha256(`token:${id}`),
      status: input.status ?? SigningSessionStatus.issued,
      expiresAt: input.expiresAt ?? new Date('2026-12-31T00:00:00.000Z'),
      consumedAt: input.consumedAt,
      requestId: input.requestId,
    },
  });
}

export async function createSignatureField(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    signerId: string;
    id?: string;
    type?: SignatureFieldType;
    pageNumber?: number;
    x?: string;
    y?: string;
    width?: string;
    height?: string;
    required?: boolean;
  },
) {
  return prisma.signatureField.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      documentId: input.documentId,
      signerId: input.signerId,
      type: input.type ?? SignatureFieldType.signature,
      pageNumber: input.pageNumber ?? 1,
      x: input.x ?? '0.10',
      y: input.y ?? '0.20',
      width: input.width ?? '0.25',
      height: input.height ?? '0.08',
      required: input.required ?? true,
    },
  });
}

export async function createConsentRecord(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    signerId: string;
    sessionId: string;
    id?: string;
    consentCopyId?: string;
    acceptedAt?: Date;
    requestId?: string;
  },
) {
  return prisma.consentRecord.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      documentId: input.documentId,
      signerId: input.signerId,
      sessionId: input.sessionId,
      consentCopyId: input.consentCopyId ?? 'consent-copy-v1',
      acceptedAt: input.acceptedAt ?? new Date('2026-08-17T12:00:00.000Z'),
      requestId: input.requestId,
    },
  });
}

export async function createFinalizedArtifact(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    id?: string;
    label?: string;
    objectKey?: string;
    contentType?: string;
    sizeBytes?: bigint;
    sha256Digest?: string;
  },
) {
  const id = input.id ?? newId();
  const sha256Digest = input.sha256Digest ?? syntheticSha256(input.label ?? `artifact:${id}`);
  return prisma.finalizedArtifact.create({
    data: {
      id,
      organizationId: input.organizationId,
      documentId: input.documentId,
      objectKey: input.objectKey ?? `tenants/${input.organizationId}/artifacts/${sha256Digest}`,
      contentType: input.contentType ?? 'application/pdf',
      sizeBytes: input.sizeBytes ?? 2048n,
      sha256Digest,
    },
  });
}

export async function createAuditLog(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId: string;
    id?: string;
    sequence?: number;
    type?: AuditEventType;
    actorType?: AuditActorType;
    actorId: string;
    occurredAt?: Date;
    payload?: Prisma.InputJsonValue;
    previousEventHash?: string;
    eventHash?: string;
    requestId?: string;
  },
) {
  const occurredAt = input.occurredAt ?? new Date('2026-08-17T12:00:00.000Z');
  const sequence = input.sequence ?? 0;
  const type = input.type ?? AuditEventType.documentCreated;
  const actorType = input.actorType ?? AuditActorType.accountUser;
  const payload = input.payload ?? { documentId: input.documentId };
  const previousEventHash = input.previousEventHash ?? AUDIT_GENESIS_PREVIOUS_EVENT_HASH;
  const eventHash =
    input.eventHash ??
    computeAuditEventHash({
      previousEventHash,
      sequence,
      type: AUDIT_EVENT_TYPE_DB[type],
      actorType: AUDIT_ACTOR_TYPE_DB[actorType],
      actorId: input.actorId,
      occurredAt,
      payload,
    });

  return prisma.auditLog.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      documentId: input.documentId,
      sequence,
      type,
      actorType,
      actorId: input.actorId,
      occurredAt,
      payload,
      previousEventHash,
      eventHash,
      requestId: input.requestId,
    },
  });
}

export async function createOutboxEvent(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId?: string;
    id?: string;
    type?: string;
    status?: OutboxStatus;
    payload?: Prisma.InputJsonValue;
    requestId?: string;
    attemptCount?: number;
    availableAt?: Date;
    leaseOwner?: string;
    leaseUntil?: Date;
    lastErrorCode?: string;
  },
) {
  return prisma.outboxEvent.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      documentId: input.documentId,
      type: input.type ?? 'finalize_document',
      status: input.status ?? OutboxStatus.pending,
      payload: input.payload ?? {},
      requestId: input.requestId,
      attemptCount: input.attemptCount ?? 0,
      availableAt: input.availableAt,
      leaseOwner: input.leaseOwner,
      leaseUntil: input.leaseUntil,
      lastErrorCode: input.lastErrorCode,
    },
  });
}

export async function createBackgroundJob(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    documentId?: string;
    outboxEventId?: string;
    id?: string;
    type?: string;
    status?: BackgroundJobStatus;
    requestId?: string;
    attemptCount?: number;
    maxAttempts?: number;
    availableAt?: Date;
    leaseOwner?: string;
    leaseUntil?: Date;
    lastErrorCode?: string;
  },
) {
  return prisma.backgroundJob.create({
    data: {
      id: input.id ?? newId(),
      organizationId: input.organizationId,
      documentId: input.documentId,
      outboxEventId: input.outboxEventId,
      type: input.type ?? 'finalize_document',
      status: input.status ?? BackgroundJobStatus.pending,
      requestId: input.requestId,
      attemptCount: input.attemptCount ?? 0,
      maxAttempts: input.maxAttempts ?? 8,
      availableAt: input.availableAt,
      leaseOwner: input.leaseOwner,
      leaseUntil: input.leaseUntil,
      lastErrorCode: input.lastErrorCode,
    },
  });
}

export async function createIdempotencyRecord(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    principalId: string;
    id?: string;
    principalType?: IdempotencyPrincipalType;
    route?: string;
    key?: string;
    requestHash?: string;
    requestId?: string;
    expiresAt?: Date;
  },
) {
  const id = input.id ?? newId();
  return prisma.idempotencyRecord.create({
    data: {
      id,
      organizationId: input.organizationId,
      principalType: input.principalType ?? IdempotencyPrincipalType.accountUser,
      principalId: input.principalId,
      route: input.route ?? 'POST /v1/documents/send',
      key: input.key ?? id,
      requestHash: input.requestHash ?? syntheticSha256(`idempotency:${id}`),
      requestId: input.requestId,
      expiresAt: input.expiresAt ?? new Date('2026-08-18T00:00:00.000Z'),
    },
  });
}

/** Organization, owner membership, and draft document for constraint tests. */
export async function createTenantDocumentGraph(
  prisma: PrismaClient,
  overrides: { organizationName?: string } = {},
) {
  const organization = await createOrganization(prisma, { name: overrides.organizationName });
  const user = await createUser(prisma);
  const membership = await createMembership(prisma, {
    organizationId: organization.id,
    userId: user.id,
    role: MembershipRole.owner,
  });
  const document = await createDocument(prisma, {
    organizationId: organization.id,
    ownerMembershipId: membership.id,
  });
  return { organization, user, membership, document };
}
