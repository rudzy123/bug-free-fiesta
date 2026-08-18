import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
  type AccountUserActor,
  type Clock,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import {
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createUuidIdGenerator,
} from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createCompleteSourceUpload } from './complete-source-upload.js';
import { createCreateDraftDocument } from './create-draft-document.js';
import { createInspectDocument } from './inspect-document.js';
import { createLocalDevelopmentDocumentInspector } from './inspectors.js';
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
import { createMemoryNotifier } from './notifications.js';
import {
  createReplaceDocumentFields,
  createReplaceDocumentSigners,
} from './replace-preparation.js';
import { createSendDocument } from './send-document.js';
import {
  createResolveSigningSession,
  createRevokeSigningSession,
  createRotateSigningSession,
} from './signing-sessions.js';
import { createSizeLimitedObjectStorage } from './size-limited-storage.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777';
const START = '2026-08-18T12:00:00.000Z';

function nowClock(): Clock & { set: (iso: string) => void } {
  let current = new Date(START);
  return {
    nowUtc: () => new Date(current.getTime()),
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
}

function actor(organizationId = ORG): AccountUserActor {
  return {
    type: 'account_user',
    userId: USER,
    membership: { membershipId: MEMBERSHIP, organizationId, role: 'owner' },
  };
}

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');
}

function harness() {
  const clock = nowClock();
  const hashing = createSha256Hashing();
  const hasher = createSigningTokenHasher(hashing);
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const documents = createMemoryDocumentRepository();
  const revisions = createMemoryDocumentRevisionRepository();
  const uploadSessions = createMemoryUploadSessionStore();
  const previewGrants = createMemoryPreviewGrantStore();
  const signers = createMemorySignerStore();
  const fields = createMemorySignatureFieldStore();
  const sessions = createMemorySigningSessionStore();
  const idempotency = createMemoryIdempotencyRecordRepository();
  const audit = createMemoryAuditWriter();
  const jobs = createMemoryJobPublisher();
  const notifier = createMemoryNotifier();
  const storage = createSizeLimitedObjectStorage(createMemoryObjectStorage(), 2048);
  const unitOfWork = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions,
      uploadSessions,
      previewGrants,
      idempotencyRecords: idempotency,
      audit,
      jobs,
      signers,
      signatureFields: fields,
      signingSessions: sessions,
    }),
  );
  const authorization = createMembershipAuthorizationPolicy();
  return {
    clock,
    hasher,
    notifier,
    audit,
    jobs,
    createDraft: createCreateDraftDocument({
      authorization,
      idempotency,
      unitOfWork,
      ids,
      clock,
      hashing,
      tokens,
      hasher,
      maxUploadBytes: 2048,
      uploadTtlMs: 60_000,
      idempotencyTtlMs: 3_600_000,
      uploadTokenHeader: 'x-upload-token',
    }),
    completeUpload: createCompleteSourceUpload({
      documents,
      revisions,
      uploadSessions,
      hasher,
      hashing,
      ids,
      clock,
      storage,
      unitOfWork,
      maxUploadBytes: 2048,
    }),
    inspect: createInspectDocument({
      documents,
      revisions,
      storage,
      inspector: createLocalDevelopmentDocumentInspector(),
      unitOfWork,
      ids,
      clock,
    }),
    replaceSigners: createReplaceDocumentSigners({
      authorization,
      documents,
      revisions,
      signers,
      fields,
      unitOfWork,
      ids,
      clock,
    }),
    replaceFields: createReplaceDocumentFields({
      authorization,
      documents,
      revisions,
      signers,
      fields,
      unitOfWork,
      ids,
      clock,
    }),
    send: createSendDocument({
      authorization,
      documents,
      revisions,
      signers,
      fields,
      idempotency,
      unitOfWork,
      notifier,
      ids,
      clock,
      hashing,
      tokens,
      hasher,
      sessionTtlMs: 3_600_000,
      idempotencyTtlMs: 3_600_000,
    }),
    rotate: createRotateSigningSession({
      authorization,
      documents,
      signers,
      sessions,
      unitOfWork,
      notifier,
      ids,
      clock,
      tokens,
      hasher,
      sessionTtlMs: 3_600_000,
    }),
    revoke: createRevokeSigningSession({
      authorization,
      documents,
      sessions,
      unitOfWork,
      ids,
      clock,
    }),
    resolve: createResolveSigningSession({
      tokens: sessions,
      documents,
      fields,
      sessions,
      hasher,
      clock,
    }),
  };
}

async function preparedEnvelope(
  h: ReturnType<typeof harness>,
  organizationId = ORG,
  key = 'default',
) {
  const created = await h.createDraft({
    actor: actor(organizationId),
    title: 'NDA',
    filename: 'nda.pdf',
    idempotencyKey: `create-${organizationId}-${key}`,
    requestId: 'req-create',
  });
  const uploaded = await h.completeUpload({
    organizationId,
    documentId: created.documentId,
    rawToken: created.upload.token ?? '',
    contentType: 'application/pdf',
    body: pdfBytes(),
    requestId: 'req-upload',
  });
  const revisionId = uploaded.currentRevision?.revisionId;
  if (revisionId === undefined) {
    throw new Error('expected revision');
  }
  await h.inspect({
    organizationId,
    documentId: created.documentId,
    revisionId,
    jobId: 'job-inspect',
    requestId: 'req-inspect',
  });
  const withSigners = await h.replaceSigners({
    actor: actor(organizationId),
    documentId: created.documentId,
    signingMode: 'ordered',
    signers: [
      {
        email: 'alex@example.test',
        displayName: 'Alex Signer',
        routingOrder: 1,
      },
    ],
    requestId: 'req-signers',
  });
  const signerId = withSigners.signers[0]?.signerId;
  if (signerId === undefined) {
    throw new Error('expected signer');
  }
  const prepared = await h.replaceFields({
    actor: actor(organizationId),
    documentId: created.documentId,
    overlapPolicy: 'prohibit',
    fields: [
      {
        signerId,
        type: 'signature',
        pageNumber: 1,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
      },
      {
        signerId,
        type: 'date_signed',
        pageNumber: 1,
        x: 0.4,
        y: 0.1,
        width: 0.2,
        height: 0.08,
      },
    ],
    requestId: 'req-fields',
  });
  return { created, prepared, signerId };
}

describe('document preparation and send', () => {
  it('prepares signers and fields, sends, and issues hashed sessions', async () => {
    const h = harness();
    const { prepared, signerId } = await preparedEnvelope(h);
    expect(prepared.state).toBe('prepared');
    expect(prepared.signingMode).toBe('ordered');
    expect(prepared.availableForSigning).toBe(false);
    const sent = await h.send({
      actor: actor(),
      documentId: prepared.documentId,
      idempotencyKey: 'send-key-1',
      requestId: 'req-send',
    });
    expect(sent.state).toBe('sent');
    expect(sent.availableForSigning).toBe(true);
    expect(sent.invitations).toHaveLength(1);
    expect(sent.invitations[0]?.token).toEqual(expect.any(String));
    expect(h.notifier.sent[0]?.rawToken).toBe(sent.invitations[0]?.token);
    expect(h.audit.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'signers_updated',
        'fields_updated',
        'session_issued',
        'document_sent',
      ]),
    );
    expect(h.jobs.events.some((event) => event.type === 'notify_signer')).toBe(true);
    const view = await h.resolve({ rawToken: sent.invitations[0]?.token ?? '' });
    expect(view.signerId).toBe(signerId);
    expect(view.documentId).toBe(prepared.documentId);
    expect(view.fields).toHaveLength(2);
  });

  it('replays send without issuing a second token', async () => {
    const h = harness();
    const { prepared } = await preparedEnvelope(h);
    const first = await h.send({
      actor: actor(),
      documentId: prepared.documentId,
      idempotencyKey: 'send-same',
      requestId: 'req-send-1',
    });
    const replay = await h.send({
      actor: actor(),
      documentId: prepared.documentId,
      idempotencyKey: 'send-same',
      requestId: 'req-send-2',
    });
    expect(replay.invitations[0]?.sessionId).toBe(first.invitations[0]?.sessionId);
    expect(replay.invitations[0]?.token).toBeNull();
  });

  it('rejects overlapping fields and pages outside the PDF', async () => {
    const h = harness();
    const { prepared, signerId } = await preparedEnvelope(h);
    await expect(
      h.replaceFields({
        actor: actor(),
        documentId: prepared.documentId,
        overlapPolicy: 'prohibit',
        fields: [
          {
            signerId,
            type: 'signature',
            pageNumber: 1,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.1,
          },
          {
            signerId,
            type: 'initials',
            pageNumber: 1,
            x: 0.15,
            y: 0.12,
            width: 0.2,
            height: 0.1,
          },
        ],
        requestId: 'req-overlap',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      h.replaceFields({
        actor: actor(),
        documentId: prepared.documentId,
        overlapPolicy: 'prohibit',
        fields: [
          {
            signerId,
            type: 'signature',
            pageNumber: 9,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.1,
          },
        ],
        requestId: 'req-page',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not let a user prepare documents in another tenant', async () => {
    const h = harness();
    const { created } = await preparedEnvelope(h);
    const policy = createMembershipAuthorizationPolicy();
    expect(() =>
      policy.assertAllowed(actor(OTHER), 'document.write', {
        organizationId: ORG,
        documentId: created.documentId,
      }),
    ).toThrow(AuthorizationError);
    await expect(
      h.replaceSigners({
        actor: actor(OTHER),
        documentId: created.documentId,
        signingMode: 'parallel',
        signers: [{ email: 'other@example.test', displayName: 'Other', routingOrder: 1 }],
        requestId: 'req-cross',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('locks fields after send so they cannot be moved', async () => {
    const h = harness();
    const { prepared, signerId } = await preparedEnvelope(h);
    await h.send({
      actor: actor(),
      documentId: prepared.documentId,
      idempotencyKey: 'send-lock',
      requestId: 'req-send',
    });
    await expect(
      h.replaceFields({
        actor: actor(),
        documentId: prepared.documentId,
        overlapPolicy: 'prohibit',
        fields: [
          {
            signerId,
            type: 'signature',
            pageNumber: 1,
            x: 0.5,
            y: 0.5,
            width: 0.2,
            height: 0.1,
          },
        ],
        requestId: 'req-move',
      }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('does not let a signer token access another document or signer', async () => {
    const h = harness();
    const first = await preparedEnvelope(h, ORG, 'first');
    const second = await preparedEnvelope(h, ORG, 'second');
    const sent = await h.send({
      actor: actor(),
      documentId: first.prepared.documentId,
      idempotencyKey: 'send-first',
      requestId: 'req-send',
    });
    const token = sent.invitations[0]?.token ?? '';
    const view = await h.resolve({ rawToken: token });
    expect(view.documentId).toBe(first.prepared.documentId);
    expect(view.signerId).toBe(first.signerId);
    expect(view.documentId).not.toBe(second.prepared.documentId);
    expect(view.signerId).not.toBe(second.signerId);
  });

  it('rejects revoked and expired tokens', async () => {
    const h = harness();
    const { prepared } = await preparedEnvelope(h);
    const sent = await h.send({
      actor: actor(),
      documentId: prepared.documentId,
      idempotencyKey: 'send-revoke',
      requestId: 'req-send',
    });
    const token = sent.invitations[0]?.token ?? '';
    const sessionId = sent.invitations[0]?.sessionId ?? '';
    await h.revoke({
      actor: actor(),
      documentId: prepared.documentId,
      sessionId,
      requestId: 'req-revoke',
    });
    await expect(h.resolve({ rawToken: token })).rejects.toBeInstanceOf(AuthenticationError);

    const rotated = await h.rotate({
      actor: actor(),
      documentId: prepared.documentId,
      signerId: sent.invitations[0]?.signerId ?? '',
      requestId: 'req-rotate',
    });
    h.clock.set('2026-09-18T12:00:00.000Z');
    await expect(h.resolve({ rawToken: rotated.token })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});
