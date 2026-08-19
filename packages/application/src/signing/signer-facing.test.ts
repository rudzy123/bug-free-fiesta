import { describe, expect, it } from 'vitest';
import { createTestPng } from '@esign/test-utils';
import {
  AuthenticationError,
  ValidationError,
  type AccountUserActor,
  type Clock,
} from '@esign/domain';
import { hashesEqual } from '../auth/csrf.js';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createCompleteSourceUpload } from '../documents/complete-source-upload.js';
import { createCreateDraftDocument } from '../documents/create-draft-document.js';
import { createInspectDocument } from '../documents/inspect-document.js';
import { createLocalDevelopmentDocumentInspector } from '../documents/inspectors.js';
import {
  createMemoryAuditWriter,
  createMemoryConsentStore,
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
} from '../documents/memory-adapters.js';
import { createMemoryNotifier } from '../documents/notifications.js';
import {
  createReplaceDocumentFields,
  createReplaceDocumentSigners,
} from '../documents/replace-preparation.js';
import { createSendDocument } from '../documents/send-document.js';
import { createSizeLimitedObjectStorage } from '../documents/size-limited-storage.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import {
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createUuidIdGenerator,
} from '../ports/node-crypto.js';
import { createConsentDisclosureCatalog } from './consent-catalog.js';
import { createSigningEnvelopePolicy } from './envelope-policy.js';
import { createExchangeSigningToken } from './exchange-signing-token.js';
import { createLoadSignerSession } from './load-signer-session.js';
import { createCompleteSigning } from './complete-signing.js';
import { clientRequestMetadataFromHeaders } from './request-metadata.js';
import {
  createDeclineToSign,
  createRecordSignerConsent,
  createRecordSignerViewed,
  sanitizeDeclineReason,
} from './signer-mutations.js';
import {
  createGetSignerConsent,
  createGetSignerDocument,
  createGetSignerFields,
  createGetSignerSession,
  createIssueSignerPreview,
} from './signer-queries.js';

const ORG = '11111111-1111-4111-8111-111111111111';
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

function harness(options?: { requiresAccountAuth?: boolean }) {
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
  const consent = createMemoryConsentStore();
  const idempotency = createMemoryIdempotencyRecordRepository();
  const audit = createMemoryAuditWriter();
  const jobs = createMemoryJobPublisher();
  const notifier = createMemoryNotifier();
  const storage = createSizeLimitedObjectStorage(createMemoryObjectStorage(), 8192);
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
      consentRecords: consent,
    }),
  );
  const authorization = createMembershipAuthorizationPolicy();
  const catalog = createConsentDisclosureCatalog();
  const envelopePolicy = createSigningEnvelopePolicy({
    requiresAccountAuth: options?.requiresAccountAuth,
  });
  const loadSession = createLoadSignerSession({
    tokens: sessions,
    documents,
    signers,
    sessions,
    hasher,
    clock,
    envelopePolicy,
  });
  return {
    clock,
    hasher,
    audit,
    sessions,
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
    exchange: createExchangeSigningToken({
      loadSession,
      unitOfWork,
      ids,
      clock,
      tokens,
      hasher,
    }),
    getSession: createGetSignerSession({
      loadSession,
      authorization,
      consent,
      catalog,
    }),
    getDocument: createGetSignerDocument({
      loadSession,
      authorization,
      revisions,
    }),
    getFields: createGetSignerFields({
      loadSession,
      authorization,
      fields,
    }),
    getConsent: createGetSignerConsent({
      loadSession,
      authorization,
      catalog,
      consent,
    }),
    issuePreview: createIssueSignerPreview({
      loadSession,
      authorization,
      revisions,
      previewGrants,
      tokens,
      hasher,
      ids,
      clock,
      previewTtlMs: 120_000,
      previewTokenHeader: 'x-preview-token',
    }),
    recordViewed: createRecordSignerViewed({
      loadSession,
      authorization,
      unitOfWork,
      ids,
      clock,
    }),
    recordConsent: createRecordSignerConsent({
      loadSession,
      authorization,
      catalog,
      consent,
      unitOfWork,
      ids,
      clock,
    }),
    decline: createDeclineToSign({
      loadSession,
      authorization,
      signers,
      unitOfWork,
      ids,
      clock,
    }),
    complete: createCompleteSigning({
      loadSession,
      authorization,
      signers,
      fields,
      consent,
      storage,
      hashing,
      idempotency,
      unitOfWork,
      ids,
      clock,
      idempotencyTtlMs: 3_600_000,
      maxPngBytes: 256_000,
    }),
    jobs,
    documents,
    fields,
  };
}

async function sentEnvelope(h: ReturnType<typeof harness>, key = 'default') {
  const created = await h.createDraft({
    actor: actor(),
    title: 'NDA',
    filename: 'nda.pdf',
    idempotencyKey: `create-${key}`,
    requestId: 'req-create',
  });
  const uploaded = await h.completeUpload({
    organizationId: ORG,
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
    organizationId: ORG,
    documentId: created.documentId,
    revisionId,
    jobId: 'job-inspect',
    requestId: 'req-inspect',
  });
  const withSigners = await h.replaceSigners({
    actor: actor(),
    documentId: created.documentId,
    signingMode: 'ordered',
    signers: [{ email: 'alex@example.test', displayName: 'Alex Signer', routingOrder: 1 }],
    requestId: 'req-signers',
  });
  const signerId = withSigners.signers[0]?.signerId;
  if (signerId === undefined) {
    throw new Error('expected signer');
  }
  await h.replaceFields({
    actor: actor(),
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
    ],
    requestId: 'req-fields',
  });
  const sent = await h.send({
    actor: actor(),
    documentId: created.documentId,
    idempotencyKey: `send-${key}`,
    requestId: 'req-send',
  });
  return { sent, signerId, urlToken: sent.invitations[0]?.token ?? '' };
}

describe('signer-facing session', () => {
  it('exchanges a URL token once and serves metadata from the rotated cookie token', async () => {
    const h = harness();
    const { sent, signerId, urlToken } = await sentEnvelope(h);
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    expect(exchanged.sessionId).toBe(sent.invitations[0]?.sessionId);
    expect(exchanged.rawSessionToken).not.toBe(urlToken);
    await expect(
      h.exchange({ rawToken: urlToken, requestId: 'req-replay' }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    const session = await h.getSession({ rawToken: exchanged.rawSessionToken });
    expect(session.signerId).toBe(signerId);
    expect(session.documentId).toBe(sent.documentId);
    expect(JSON.stringify(session)).not.toContain(ORG);
    expect(JSON.stringify(session)).not.toContain(urlToken);
    const document = await h.getDocument({ rawToken: exchanged.rawSessionToken });
    expect(document.pageCount).toBe(1);
    const fields = await h.getFields({ rawToken: exchanged.rawSessionToken });
    expect(fields).toHaveLength(1);
    expect(fields[0]?.type).toBe('signature');
  });

  it('rejects unknown, revoked, and expired tokens with the same authentication error', async () => {
    const h = harness();
    const { urlToken, sent } = await sentEnvelope(h, 'authz');
    const unknown = h.exchange({ rawToken: 'not-a-real-token', requestId: 'req-unknown' });
    await expect(unknown).rejects.toBeInstanceOf(AuthenticationError);

    const sessionId = sent.invitations[0]?.sessionId ?? '';
    await h.sessions.revoke({
      organizationId: ORG,
      sessionId,
      revokedAt: h.clock.nowUtc(),
    });
    await expect(
      h.exchange({ rawToken: urlToken, requestId: 'req-revoked' }),
    ).rejects.toBeInstanceOf(AuthenticationError);

    const fresh = harness();
    const rotated = await sentEnvelope(fresh, 'exp');
    const exchanged = await fresh.exchange({ rawToken: rotated.urlToken, requestId: 'req-ok' });
    fresh.clock.set('2026-09-18T12:00:00.000Z');
    await expect(fresh.getSession({ rawToken: exchanged.rawSessionToken })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('records viewed and explicit consent, and isolates tenants', async () => {
    const h = harness();
    const { urlToken, sent } = await sentEnvelope(h, 'consent');
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    const cookie = exchanged.rawSessionToken;
    await h.recordViewed({ rawToken: cookie, requestId: 'req-view' });
    const disclosure = await h.getConsent({ rawToken: cookie });
    expect(disclosure.required).toBe(true);
    await expect(
      h.recordConsent({
        rawToken: cookie,
        copyId: disclosure.copyId,
        accepted: false,
        requestId: 'req-no',
        metadata: clientRequestMetadataFromHeaders({
          forwardedFor: undefined,
          remoteAddress: '127.0.0.1',
          userAgent: 'vitest',
        }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const recorded = await h.recordConsent({
      rawToken: cookie,
      copyId: disclosure.copyId,
      accepted: true,
      requestId: 'req-yes',
      metadata: clientRequestMetadataFromHeaders({
        forwardedFor: '203.0.113.9',
        remoteAddress: '127.0.0.1',
        userAgent: 'vitest',
      }),
    });
    const replay = await h.recordConsent({
      rawToken: cookie,
      copyId: disclosure.copyId,
      accepted: true,
      requestId: 'req-yes-2',
      metadata: clientRequestMetadataFromHeaders({
        forwardedFor: undefined,
        remoteAddress: '127.0.0.1',
        userAgent: 'vitest',
      }),
    });
    expect(replay.consentId).toBe(recorded.consentId);
    expect(h.audit.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['session_exchanged', 'document_viewed', 'consent_recorded']),
    );
    expect(JSON.stringify(h.audit.events)).not.toContain(urlToken);
    expect(JSON.stringify(h.audit.events)).not.toContain(cookie);

    const other = await sentEnvelope(h, 'other');
    const otherEx = await h.exchange({ rawToken: other.urlToken, requestId: 'req-other' });
    const otherSession = await h.getSession({ rawToken: otherEx.rawSessionToken });
    expect(otherSession.documentId).toBe(other.sent.documentId);
    expect(otherSession.documentId).not.toBe(sent.documentId);
    await expect(h.getSession({ rawToken: cookie })).resolves.toMatchObject({
      documentId: sent.documentId,
    });
  });

  it('declines with a sanitized reason and revokes the session', async () => {
    const h = harness();
    const { urlToken } = await sentEnvelope(h, 'decline');
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    const result = await h.decline({
      rawToken: exchanged.rawSessionToken,
      reason: 'Changed my mind\u0000',
      requestId: 'req-decline',
      metadata: clientRequestMetadataFromHeaders({
        forwardedFor: undefined,
        remoteAddress: '127.0.0.1',
        userAgent: 'vitest',
      }),
    });
    expect(result.status).toBe('declined');
    await expect(h.getSession({ rawToken: exchanged.rawSessionToken })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('requires an account when envelope policy says so', async () => {
    const h = harness({ requiresAccountAuth: true });
    const { urlToken } = await sentEnvelope(h, 'account');
    await expect(h.exchange({ rawToken: urlToken, requestId: 'req-ex' })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('issues a short-lived preview bound to the session document', async () => {
    const h = harness();
    const { urlToken, sent } = await sentEnvelope(h, 'preview');
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    const preview = await h.issuePreview({ rawToken: exchanged.rawSessionToken });
    expect(preview.url).toMatch(/^\/document-previews\//);
    expect(preview.url).not.toContain(ORG);
    expect(preview.token).toEqual(expect.any(String));
    expect(sent.documentId).toEqual(expect.any(String));
  });
});

describe('complete signing', () => {
  it('records consent-backed completions, publishes flatten_signature, and is idempotent', async () => {
    const h = harness();
    const { urlToken, signerId } = await sentEnvelope(h, 'complete');
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    const cookie = exchanged.rawSessionToken;
    const disclosure = await h.getConsent({ rawToken: cookie });
    await h.recordConsent({
      rawToken: cookie,
      copyId: disclosure.copyId,
      accepted: true,
      requestId: 'req-consent',
      metadata: clientRequestMetadataFromHeaders({
        forwardedFor: '203.0.113.9',
        remoteAddress: '127.0.0.1',
        userAgent: 'vitest',
      }),
    });
    const fields = await h.getFields({ rawToken: cookie });
    const fieldId = fields[0]?.fieldId;
    if (fieldId === undefined) {
      throw new Error('expected field');
    }
    const png = createTestPng({ width: 16, height: 8 });
    const result = await h.complete({
      rawToken: cookie,
      consentCopyId: disclosure.copyId,
      intentToSign: true,
      fieldIds: [fieldId],
      signature: { pngBase64: Buffer.from(png).toString('base64') },
      idempotencyKey: 'complete-sign-key-1',
      requestId: 'req-complete',
    });
    expect(result.status).toBe('accepted');
    expect(result.signerId).toBe(signerId);
    expect(h.documents.records[0]?.state).toBe('completed');
    expect(h.jobs.events.some((event) => event.type === 'flatten_signature')).toBe(true);
    const replay = await h.complete({
      rawToken: cookie,
      consentCopyId: disclosure.copyId,
      intentToSign: true,
      fieldIds: [fieldId],
      signature: { pngBase64: Buffer.from(png).toString('base64') },
      idempotencyKey: 'complete-sign-key-1',
      requestId: 'req-complete-2',
    });
    expect(replay.status).toBe('accepted');
    expect(h.jobs.events.filter((event) => event.type === 'flatten_signature')).toHaveLength(1);
    expect(h.fields.records[0]?.completionObjectKey).toContain('/signatures/');
  });

  it('rejects completion without consent or without required ink', async () => {
    const h = harness();
    const { urlToken } = await sentEnvelope(h, 'no-consent');
    const exchanged = await h.exchange({ rawToken: urlToken, requestId: 'req-ex' });
    const fields = await h.getFields({ rawToken: exchanged.rawSessionToken });
    const fieldId = fields[0]?.fieldId ?? '';
    await expect(
      h.complete({
        rawToken: exchanged.rawSessionToken,
        consentCopyId: 'esign-disclosure-v1',
        intentToSign: true,
        fieldIds: [fieldId],
        signature: { pngBase64: Buffer.from(createTestPng()).toString('base64') },
        idempotencyKey: 'complete-sign-key-2',
        requestId: 'req-no',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('signer helpers', () => {
  it('compares hashes in constant time and sanitizes decline reasons', () => {
    const hashing = createSha256Hashing();
    const left = hashing.sha256Hex('alpha');
    const right = hashing.sha256Hex('alpha');
    expect(hashesEqual(left, right)).toBe(true);
    expect(hashesEqual(left, hashing.sha256Hex('beta'))).toBe(false);
    expect(sanitizeDeclineReason('  ok  ')).toBe('ok');
    expect(sanitizeDeclineReason('\u0007')).toBeNull();
  });

  it('captures IP and user agent only through the metadata adapter', () => {
    const meta = clientRequestMetadataFromHeaders({
      forwardedFor: '203.0.113.10, 10.0.0.1',
      remoteAddress: '127.0.0.1',
      userAgent: 'SignerApp/1.0',
    });
    expect(meta.untrustedClientIp).toBe('203.0.113.10');
    expect(meta.untrustedUserAgent).toBe('SignerApp/1.0');
  });
});
