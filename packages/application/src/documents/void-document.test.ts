import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  InvalidStateTransitionError,
  NotFoundError,
  type AccountUserActor,
  type Clock,
  type Document,
  type Signer,
  type SigningSession,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createSha256Hashing, createUuidIdGenerator } from '../ports/node-crypto.js';
import { createVoidDocument } from './void-document.js';
import {
  createMemoryAuditWriter,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryPreviewGrantStore,
  createMemorySignatureFieldStore,
  createMemorySignerStore,
  createMemorySigningSessionStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
} from './memory-adapters.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777';
const DOC = '44444444-4444-4444-8444-444444444444';
const SIGNER = '55555555-5555-4555-8555-555555555555';
const SESSION = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-08-25T12:00:00.000Z');

function actor(
  organizationId = ORG,
  role: AccountUserActor['membership']['role'] = 'owner',
): AccountUserActor {
  return {
    type: 'account_user',
    userId: USER,
    membership: { membershipId: MEMBERSHIP, organizationId, role },
  };
}

function nowClock(): Clock {
  return { nowUtc: () => new Date(NOW.getTime()) };
}

function documentRecord(state: Document['state']): Document {
  return {
    id: DOC,
    organizationId: ORG,
    ownerMembershipId: MEMBERSHIP,
    title: 'NDA',
    state,
    signingMode: 'ordered',
    inspectionStatus: 'accepted',
    sourceDisplayName: 'nda.pdf',
    expiresAt: null,
    currentRevisionId: null,
    signingRevisionId: null,
    version: 1,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function signerRecord(): Signer {
  return {
    id: SIGNER,
    organizationId: ORG,
    documentId: DOC,
    accountUserId: null,
    routingOrder: 1,
    status: 'pending',
    email: null,
    displayName: 'Alex Signer',
    version: 1,
    completedAt: null,
    declinedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function sessionRecord(status: SigningSession['status'] = 'active'): SigningSession {
  return {
    id: SESSION,
    organizationId: ORG,
    documentId: DOC,
    signerId: SIGNER,
    tokenHash: 'a'.repeat(64),
    csrfTokenHash: 'b'.repeat(64),
    status,
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: status === 'issued' ? null : NOW,
    completedAt: null,
    revokedAt: null,
    presentationAttemptCount: 1,
    failedPresentationCount: 0,
    lastPresentedAt: NOW,
    requestId: 'req-sign',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function harness(state: Document['state'] = 'sent') {
  const hashing = createSha256Hashing();
  const ids = createUuidIdGenerator();
  const documents = createMemoryDocumentRepository([documentRecord(state)]);
  const revisions = createMemoryDocumentRevisionRepository();
  const signers = createMemorySignerStore([signerRecord()]);
  const sessions = createMemorySigningSessionStore([sessionRecord()]);
  const fields = createMemorySignatureFieldStore();
  const audit = createMemoryAuditWriter();
  const idempotency = createMemoryIdempotencyRecordRepository();
  const unitOfWork = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions,
      uploadSessions: createMemoryUploadSessionStore(),
      previewGrants: createMemoryPreviewGrantStore(),
      idempotencyRecords: idempotency,
      audit,
      jobs: createMemoryJobPublisher(),
      signers,
      signatureFields: fields,
      signingSessions: sessions,
    }),
  );
  const voidDocument = createVoidDocument({
    authorization: createMembershipAuthorizationPolicy(),
    documents,
    revisions,
    signers,
    fields,
    idempotency,
    unitOfWork,
    ids,
    clock: nowClock(),
    hashing,
    idempotencyTtlMs: 3_600_000,
  });
  return { voidDocument, documents, sessions, audit };
}

describe('voidDocument', () => {
  it('voids a sent document, revokes open sessions, and appends an audit event', async () => {
    const h = harness('sent');
    const result = await h.voidDocument({
      actor: actor(),
      documentId: DOC,
      idempotencyKey: 'void-key-1',
      requestId: 'req-void-1',
    });
    expect(result.state).toBe('voided');
    expect(h.documents.records[0]?.state).toBe('voided');
    expect(h.sessions.records[0]?.status).toBe('revoked');
    expect(h.audit.events.map((event) => event.type)).toContain('document_voided');
    expect(JSON.stringify(h.audit.events)).not.toMatch(/token|email|nda\.pdf/i);
  });

  it('replays the same idempotency key without a second audit event', async () => {
    const h = harness('in_progress');
    const input = {
      actor: actor(),
      documentId: DOC,
      idempotencyKey: 'void-key-replay',
      requestId: 'req-void-2',
    };
    const first = await h.voidDocument(input);
    const second = await h.voidDocument({ ...input, requestId: 'req-void-3' });
    expect(second).toEqual(first);
    expect(h.audit.events.filter((event) => event.type === 'document_voided')).toHaveLength(1);
  });

  it('rejects voiding a finalized document', async () => {
    const h = harness('finalized');
    await expect(
      h.voidDocument({
        actor: actor(),
        documentId: DOC,
        idempotencyKey: 'void-key-final',
        requestId: 'req-void-4',
      }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('denies a member from voiding', async () => {
    const h = harness('sent');
    await expect(
      h.voidDocument({
        actor: actor(ORG, 'member'),
        documentId: DOC,
        idempotencyKey: 'void-key-member',
        requestId: 'req-void-5',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('does not void a document in another organization', async () => {
    const h = harness('sent');
    await expect(
      h.voidDocument({
        actor: actor(OTHER),
        documentId: DOC,
        idempotencyKey: 'void-key-cross',
        requestId: 'req-void-6',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
