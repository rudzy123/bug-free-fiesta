import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import {
  createAssertAccountAction,
  createCleanupAbandonedUploads,
  createCompleteSourceUpload,
  createConsentDisclosureCatalog,
  createCreateDraftDocument,
  createDeclineToSign,
  createDocumentInspector,
  createExchangeSigningToken,
  createGetOrganizationDocument,
  createGetSignerConsent,
  createGetSignerDocument,
  createGetSignerFields,
  createGetSignerSession,
  createInspectDocument,
  createIssueDocumentPreview,
  createIssueSignerPreview,
  createLoadCurrentAccountUser,
  createLoadSignerSession,
  createLocalIdentityProvider,
  createLoginAccountUser,
  createLogoutAccountUser,
  createMembershipAuthorizationPolicy,
  createMemoryAccountSecurityAuditWriter,
  createMemoryAccountSessionRepository,
  createMemoryAuditWriter,
  createMemoryConsentStore,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryMembershipRepository,
  createMemoryNotifier,
  createMemoryObjectStorage,
  createMemoryPreviewGrantStore,
  createMemoryRateLimiter,
  createMemorySignatureFieldStore,
  createMemorySignerStore,
  createMemorySigningSessionStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
  createMemoryUserRepository,
  createRecordSignerConsent,
  createRecordSignerViewed,
  createReplaceDocumentFields,
  createReplaceDocumentSigners,
  createResolveAccountSession,
  createResolveOrganizationActor,
  createRevokeAccountSession,
  createRevokeSigningSession,
  createRotateSigningSession,
  createSendDocument,
  createSha256Hashing,
  createSigningEnvelopePolicy,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createSizeLimitedObjectStorage,
  createStreamDocumentPreview,
  createUuidIdGenerator,
  LOCAL_INSPECTOR_REJECT_MARKER,
} from '@esign/application';
import {
  createDocumentResponseSchema,
  declineToSignResponseSchema,
  errorEnvelopeSchema,
  exchangeSigningTokenResponseSchema,
  publicDocumentSchema,
  recordSignerConsentResponseSchema,
  sendDocumentResponseSchema,
  signerConsentResponseSchema,
  signerFieldsResponseSchema,
  signerSessionResponseSchema,
} from '@esign/contracts';
import type { AccountUser, Clock, OrganizationMembership } from '@esign/domain';
import { createHealthService } from './application/health-service.js';
import { createApiApp } from './create-app.js';
import { createAccountAuthRouter } from './http/routes/account-auth.js';
import { createDocumentIngestionRouter } from './http/routes/documents.js';
import { createSigningRouter } from './http/routes/signing.js';

const ORG_NORTH = '11111111-1111-4111-8111-111111111111';
const ORG_SOUTH = '22222222-2222-4222-8222-222222222222';
const USER_ADA = '33333333-3333-4333-8333-333333333333';
const USER_BEAU = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_NORTH_ADA = '55555555-5555-4555-8555-555555555551';
const MEMBERSHIP_SOUTH_BEAU = '55555555-5555-4555-8555-555555555553';
const ORIGIN = 'http://localhost:3000';
const SHARED_SECRET = 'local-dev-only-shared-secret';
const START = '2026-08-18T12:00:00.000Z';
const MAX_BYTES = 2048;

function nowClock(): Clock & { set: (iso: string) => void } {
  let current = new Date(START);
  return {
    nowUtc: () => new Date(current.getTime()),
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
}

function pdfBytes(extra = ''): Buffer {
  return Buffer.from(`%PDF-1.4\n${extra}\n%%EOF\n`);
}

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => pair.length > 0)
    .join('; ');
}

function cookieValue(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }
  return undefined;
}

function testIngestionApp(clock: Clock & { set: (iso: string) => void } = nowClock()) {
  const config = loadApiConfig(
    apiEnv({
      AUTH_SESSION_TTL_SECONDS: '600',
      DOCUMENT_MAX_UPLOAD_BYTES: String(MAX_BYTES),
      DOCUMENT_UPLOAD_TTL_SECONDS: '60',
    }),
  );
  const logger = createLogger({ name: 'api-docs-test', level: 'silent' });
  const hashing = createSha256Hashing();
  const hasher = createSigningTokenHasher(hashing);
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const now = new Date(START);
  const users = createMemoryUserRepository([
    {
      id: USER_ADA,
      email: 'ada@example.test',
      displayName: 'Ada Example',
      createdAt: now,
      updatedAt: now,
    } satisfies AccountUser,
    {
      id: USER_BEAU,
      email: 'beau@example.test',
      displayName: 'Beau Example',
      createdAt: now,
      updatedAt: now,
    } satisfies AccountUser,
  ]);
  const adaMemberships: OrganizationMembership[] = [
    {
      id: MEMBERSHIP_NORTH_ADA,
      organizationId: ORG_NORTH,
      userId: USER_ADA,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const beauMemberships: OrganizationMembership[] = [
    {
      id: MEMBERSHIP_SOUTH_BEAU,
      organizationId: ORG_SOUTH,
      userId: USER_BEAU,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    },
  ];
  users.setMemberships(USER_ADA, adaMemberships);
  users.setMemberships(USER_BEAU, beauMemberships);
  const memberships = createMemoryMembershipRepository([...adaMemberships, ...beauMemberships]);
  const sessions = createMemoryAccountSessionRepository();
  const audit = createMemoryAccountSecurityAuditWriter();
  const authorization = createMembershipAuthorizationPolicy();
  const documents = createMemoryDocumentRepository();
  const revisions = createMemoryDocumentRevisionRepository();
  const uploadSessions = createMemoryUploadSessionStore();
  const previewGrants = createMemoryPreviewGrantStore();
  const signers = createMemorySignerStore();
  const signatureFields = createMemorySignatureFieldStore();
  const signingSessions = createMemorySigningSessionStore();
  const consentRecords = createMemoryConsentStore();
  const notifier = createMemoryNotifier();
  const idempotency = createMemoryIdempotencyRecordRepository();
  const documentAudit = createMemoryAuditWriter();
  const jobs = createMemoryJobPublisher();
  const unitOfWork = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions,
      uploadSessions,
      previewGrants,
      idempotencyRecords: idempotency,
      audit: documentAudit,
      jobs,
      signers,
      signatureFields,
      signingSessions,
      consentRecords,
    }),
  );
  const storage = createSizeLimitedObjectStorage(createMemoryObjectStorage(), MAX_BYTES);
  const resolveSession = createResolveAccountSession({ sessions, hasher, clock });
  const resolveActor = createResolveOrganizationActor({ memberships });
  const assertAction = createAssertAccountAction({ authorization });
  const inspect = createInspectDocument({
    documents,
    revisions,
    storage,
    inspector: createDocumentInspector({ name: 'local', nodeEnv: 'test' }),
    unitOfWork,
    ids,
    clock,
  });
  const cleanup = createCleanupAbandonedUploads({
    uploadSessions,
    unitOfWork,
    ids,
    clock,
    limit: 50,
  });
  const catalog = createConsentDisclosureCatalog({
    copyId: config.SIGNING_CONSENT_COPY_ID,
    version: config.SIGNING_CONSENT_VERSION,
    title: config.SIGNING_CONSENT_TITLE,
    text: config.SIGNING_CONSENT_TEXT,
  });
  const loadSignerSession = createLoadSignerSession({
    tokens: signingSessions,
    documents,
    signers,
    sessions: signingSessions,
    hasher,
    clock,
    envelopePolicy: createSigningEnvelopePolicy(),
  });
  const documentRouter = Router();
  documentRouter.use(
    createDocumentIngestionRouter({
      config,
      resolveSession,
      resolveActor,
      hasher,
      assertAction,
      createDraft: createCreateDraftDocument({
        authorization,
        idempotency,
        unitOfWork,
        ids,
        clock,
        hashing,
        tokens,
        hasher,
        maxUploadBytes: config.DOCUMENT_MAX_UPLOAD_BYTES,
        uploadTtlMs: config.DOCUMENT_UPLOAD_TTL_SECONDS * 1000,
        idempotencyTtlMs: config.IDEMPOTENCY_TTL_SECONDS * 1000,
        uploadTokenHeader: config.DOCUMENT_UPLOAD_TOKEN_HEADER,
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
        maxUploadBytes: config.DOCUMENT_MAX_UPLOAD_BYTES,
      }),
      getDocument: createGetOrganizationDocument({
        authorization,
        documents,
        revisions,
        signers,
        fields: signatureFields,
      }),
      issuePreview: createIssueDocumentPreview({
        authorization,
        documents,
        revisions,
        previewGrants,
        tokens,
        hasher,
        ids,
        clock,
        previewTtlMs: config.DOCUMENT_PREVIEW_TTL_SECONDS * 1000,
        previewTokenHeader: config.DOCUMENT_PREVIEW_TOKEN_HEADER,
      }),
      streamPreview: createStreamDocumentPreview({
        grants: previewGrants,
        revisions,
        storage,
        hasher,
        clock,
      }),
      replaceSigners: createReplaceDocumentSigners({
        authorization,
        documents,
        revisions,
        signers,
        fields: signatureFields,
        unitOfWork,
        ids,
        clock,
      }),
      replaceFields: createReplaceDocumentFields({
        authorization,
        documents,
        revisions,
        signers,
        fields: signatureFields,
        unitOfWork,
        ids,
        clock,
      }),
      sendDocument: createSendDocument({
        authorization,
        documents,
        revisions,
        signers,
        fields: signatureFields,
        idempotency,
        unitOfWork,
        notifier,
        ids,
        clock,
        hashing,
        tokens,
        hasher,
        sessionTtlMs: config.SIGNING_SESSION_TTL_SECONDS * 1000,
        idempotencyTtlMs: config.IDEMPOTENCY_TTL_SECONDS * 1000,
      }),
      rotateSession: createRotateSigningSession({
        authorization,
        documents,
        signers,
        sessions: signingSessions,
        unitOfWork,
        notifier,
        ids,
        clock,
        tokens,
        hasher,
        sessionTtlMs: config.SIGNING_SESSION_TTL_SECONDS * 1000,
      }),
      revokeSession: createRevokeSigningSession({
        authorization,
        documents,
        sessions: signingSessions,
        unitOfWork,
        ids,
        clock,
      }),
    }),
  );
  documentRouter.use(
    createSigningRouter({
      config,
      hasher,
      rateLimiter: createMemoryRateLimiter({
        max: config.SIGNING_RATE_LIMIT_MAX,
        windowMs: config.SIGNING_RATE_LIMIT_WINDOW_MS,
        clock,
      }),
      loadCsrfHash: async (rawToken) => {
        const session = await signingSessions.findByTokenHash(hasher.hash(rawToken));
        return session?.csrfTokenHash ?? null;
      },
      exchange: createExchangeSigningToken({
        loadSession: loadSignerSession,
        unitOfWork,
        ids,
        clock,
        tokens,
        hasher,
      }),
      getSession: createGetSignerSession({
        loadSession: loadSignerSession,
        authorization,
        consent: consentRecords,
        catalog,
      }),
      getDocument: createGetSignerDocument({
        loadSession: loadSignerSession,
        authorization,
        revisions,
      }),
      getFields: createGetSignerFields({
        loadSession: loadSignerSession,
        authorization,
        fields: signatureFields,
      }),
      getConsent: createGetSignerConsent({
        loadSession: loadSignerSession,
        authorization,
        catalog,
        consent: consentRecords,
      }),
      issuePreview: createIssueSignerPreview({
        loadSession: loadSignerSession,
        authorization,
        revisions,
        previewGrants,
        tokens,
        hasher,
        ids,
        clock,
        previewTtlMs: config.DOCUMENT_PREVIEW_TTL_SECONDS * 1000,
        previewTokenHeader: config.DOCUMENT_PREVIEW_TOKEN_HEADER,
      }),
      recordViewed: createRecordSignerViewed({
        loadSession: loadSignerSession,
        authorization,
        unitOfWork,
        ids,
        clock,
      }),
      recordConsent: createRecordSignerConsent({
        loadSession: loadSignerSession,
        authorization,
        catalog,
        consent: consentRecords,
        unitOfWork,
        ids,
        clock,
      }),
      decline: createDeclineToSign({
        loadSession: loadSignerSession,
        authorization,
        signers,
        unitOfWork,
        ids,
        clock,
      }),
    }),
  );
  const app = createApiApp({
    config,
    logger,
    health: createHealthService({ ping: async () => undefined }),
    accountAuthRouter: createAccountAuthRouter({
      config,
      login: createLoginAccountUser({
        identityProvider: createLocalIdentityProvider({
          hashing,
          sharedSecret: SHARED_SECRET,
          findByEmail: (email) => users.findByEmail({ email }),
        }),
        providerName: 'local',
        users,
        sessions,
        tokens,
        hasher,
        ids,
        clock,
        audit,
        sessionTtlMs: config.AUTH_SESSION_TTL_SECONDS * 1000,
      }),
      logout: createLogoutAccountUser({ sessions, clock, ids, audit }),
      revokeSession: createRevokeAccountSession({ sessions, clock, ids, audit }),
      resolveSession,
      resolveActor,
      loadCurrentUser: createLoadCurrentAccountUser({ users }),
      assertAction,
      hasher,
      hashing,
      loginRateLimiter: createMemoryRateLimiter({
        max: config.AUTH_LOGIN_RATE_LIMIT_MAX,
        windowMs: config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        clock,
      }),
    }),
    documentRouter,
  });
  return { app, config, clock, inspect, cleanup, jobs, hashing, documentAudit };
}

async function loginAs(
  app: ReturnType<typeof testIngestionApp>['app'],
  email: string,
): Promise<{ cookies: string; csrf: string }> {
  const response = await request(app)
    .post('/auth/login')
    .set('Origin', ORIGIN)
    .send({ email, secret: SHARED_SECRET });
  expect(response.status).toBe(200);
  const cookies = cookieHeader(response);
  return { cookies, csrf: cookieValue(cookies, 'esign_csrf') ?? '' };
}

async function sendPreparedDocument(
  app: ReturnType<typeof testIngestionApp>['app'],
  inspect: ReturnType<typeof testIngestionApp>['inspect'],
  session: { cookies: string; csrf: string },
  key: string,
): Promise<{ documentId: string; signerId: string; urlToken: string; sessionId: string }> {
  const created = await request(app)
    .post(`/organizations/${ORG_NORTH}/documents`)
    .set('Origin', ORIGIN)
    .set('Cookie', session.cookies)
    .set('x-csrf-token', session.csrf)
    .set('Idempotency-Key', `create-${key}`)
    .send({ title: 'NDA', filename: 'a.pdf' });
  const draft = createDocumentResponseSchema.parse(created.body);
  const uploaded = await request(app)
    .put(draft.upload.url)
    .set(draft.upload.tokenHeader, draft.upload.token ?? '')
    .set('Content-Type', 'application/pdf')
    .send(pdfBytes());
  const revisionId = publicDocumentSchema.parse(uploaded.body).currentRevision?.revisionId ?? '';
  await inspect({
    organizationId: ORG_NORTH,
    documentId: draft.documentId,
    revisionId,
    jobId: `job-${key}`,
    requestId: `req-${key}`,
  });
  const signers = await request(app)
    .put(`/organizations/${ORG_NORTH}/documents/${draft.documentId}/signers`)
    .set('Origin', ORIGIN)
    .set('Cookie', session.cookies)
    .set('x-csrf-token', session.csrf)
    .send({
      signingMode: 'ordered',
      signers: [{ email: 'alex@example.test', displayName: 'Alex', routingOrder: 1 }],
    });
  const signerId = publicDocumentSchema.parse(signers.body).signers[0]?.signerId ?? '';
  await request(app)
    .put(`/organizations/${ORG_NORTH}/documents/${draft.documentId}/fields`)
    .set('Origin', ORIGIN)
    .set('Cookie', session.cookies)
    .set('x-csrf-token', session.csrf)
    .send({
      fields: [
        {
          signerId,
          type: 'signature',
          pageNumber: 1,
          x: 0.1,
          y: 0.1,
          width: 0.25,
          height: 0.1,
        },
      ],
    });
  const sent = await request(app)
    .post(`/organizations/${ORG_NORTH}/documents/${draft.documentId}/send`)
    .set('Origin', ORIGIN)
    .set('Cookie', session.cookies)
    .set('x-csrf-token', session.csrf)
    .set('Idempotency-Key', `send-${key}`)
    .send({});
  const sentBody = sendDocumentResponseSchema.parse(sent.body);
  return {
    documentId: draft.documentId,
    signerId,
    urlToken: sentBody.invitations[0]?.token ?? '',
    sessionId: sentBody.invitations[0]?.sessionId ?? '',
  };
}

async function exchangeSigner(
  app: ReturnType<typeof testIngestionApp>['app'],
  urlToken: string,
): Promise<{ cookies: string; csrf: string; sessionId: string }> {
  const response = await request(app)
    .post('/signing/exchange')
    .set('Origin', ORIGIN)
    .send({ token: urlToken });
  expect(response.status).toBe(200);
  exchangeSigningTokenResponseSchema.parse(response.body);
  const cookies = cookieHeader(response);
  return {
    cookies,
    csrf: cookieValue(cookies, 'esign_sign_csrf') ?? '',
    sessionId: response.body.sessionId,
  };
}

describe('secure document ingestion', () => {
  it('creates a draft, accepts a PDF upload, inspects, and issues a preview without object keys', async () => {
    const { app, inspect, jobs, hashing } = testIngestionApp();
    const session = await loginAs(app, 'ada@example.test');
    const created = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('Idempotency-Key', 'create-nda-1')
      .send({ title: 'NDA', filename: '../../tmp/Contract.PDF' });
    expect(created.status).toBe(201);
    const body = createDocumentResponseSchema.parse(created.body);
    expect(body.displayName).toBe('Contract.pdf');
    expect(body.inspectionStatus).toBe('pending');
    expect(body.availableForSigning).toBe(false);
    expect(body.upload.token).toEqual(expect.any(String));
    expect(JSON.stringify(created.body)).not.toContain('org/');

    const pdf = pdfBytes();
    const uploaded = await request(app)
      .put(body.upload.url)
      .set(body.upload.tokenHeader, body.upload.token ?? '')
      .set('Content-Type', 'application/pdf')
      .send(pdf);
    expect(uploaded.status).toBe(200);
    const afterUpload = publicDocumentSchema.parse(uploaded.body);
    expect(afterUpload.currentRevision?.sha256Digest).toBe(hashing.sha256Hex(pdf));
    expect(afterUpload.inspectionStatus).toBe('pending');
    expect(jobs.events[0]?.type).toBe('inspect_document');

    await inspect({
      organizationId: ORG_NORTH,
      documentId: body.documentId,
      revisionId: afterUpload.currentRevision?.revisionId ?? '',
      jobId: 'job-1',
      requestId: 'req-inspect',
    });

    const preview = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents/${body.documentId}/previews`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf);
    expect(preview.status).toBe(201);
    expect(JSON.stringify(preview.body)).not.toContain('org/');
    const streamed = await request(app)
      .get(preview.body.url)
      .set(preview.body.tokenHeader, preview.body.token);
    expect(streamed.status).toBe(200);
    expect(streamed.headers['content-type']).toMatch(/pdf/);
  });

  it('rejects oversized, malformed, and wrong-magic uploads', async () => {
    const { app } = testIngestionApp();
    const session = await loginAs(app, 'ada@example.test');
    const created = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('Idempotency-Key', 'negatives')
      .send({ title: 'NDA', filename: 'a.pdf' });
    const upload = createDocumentResponseSchema.parse(created.body).upload;

    const oversized = await request(app)
      .put(upload.url)
      .set(upload.tokenHeader, upload.token ?? '')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.alloc(MAX_BYTES + 1, 0x41));
    expect(oversized.status).toBe(413);
    expect(errorEnvelopeSchema.parse(oversized.body).error.code).toBe('payload_too_large');

    const wrongMagic = await request(app)
      .put(upload.url)
      .set(upload.tokenHeader, upload.token ?? '')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('not-a-pdf'));
    expect(wrongMagic.status).toBe(400);

    const malformedType = await request(app)
      .put(upload.url)
      .set(upload.tokenHeader, upload.token ?? '')
      .set('Content-Type', 'text/plain')
      .send(pdfBytes());
    // Strict content-type enforcement rejects unsupported media types up front.
    expect(malformedType.status).toBe(415);
    expect(errorEnvelopeSchema.parse(malformedType.body).error.code).toBe('unsupported_media_type');
  });

  it('denies cross-tenant document access', async () => {
    const { app } = testIngestionApp();
    const ada = await loginAs(app, 'ada@example.test');
    const created = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', ada.cookies)
      .set('x-csrf-token', ada.csrf)
      .set('Idempotency-Key', 'cross-tenant')
      .send({ title: 'NDA', filename: 'a.pdf' });
    const documentId = createDocumentResponseSchema.parse(created.body).documentId;

    const beau = await loginAs(app, 'beau@example.test');
    const forbidden = await request(app)
      .get(`/organizations/${ORG_NORTH}/documents/${documentId}`)
      .set('Cookie', beau.cookies);
    expect(forbidden.status).toBe(403);

    const hidden = await request(app)
      .get(`/organizations/${ORG_SOUTH}/documents/${documentId}`)
      .set('Cookie', beau.cookies);
    expect(hidden.status).toBe(404);
  });

  it('cleans up abandoned uploads so a late PUT cannot complete', async () => {
    const clock = nowClock();
    const { app, cleanup } = testIngestionApp(clock);
    const session = await loginAs(app, 'ada@example.test');
    const created = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('Idempotency-Key', 'abandoned')
      .send({ title: 'NDA', filename: 'a.pdf' });
    const upload = createDocumentResponseSchema.parse(created.body).upload;
    clock.set('2026-08-18T12:02:00.000Z');
    expect((await cleanup()).abandoned).toBe(1);
    const late = await request(app)
      .put(upload.url)
      .set(upload.tokenHeader, upload.token ?? '')
      .set('Content-Type', 'application/pdf')
      .send(pdfBytes());
    expect(late.status).toBe(409);
  });

  it('marks inspection rejected for the local stub reject marker', async () => {
    const { app, inspect } = testIngestionApp();
    const session = await loginAs(app, 'ada@example.test');
    const created = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('Idempotency-Key', 'reject-marker')
      .send({ title: 'NDA', filename: 'a.pdf' });
    const body = createDocumentResponseSchema.parse(created.body);
    const uploaded = await request(app)
      .put(body.upload.url)
      .set(body.upload.tokenHeader, body.upload.token ?? '')
      .set('Content-Type', 'application/pdf')
      .send(pdfBytes(LOCAL_INSPECTOR_REJECT_MARKER));
    const revisionId = publicDocumentSchema.parse(uploaded.body).currentRevision?.revisionId ?? '';
    const inspected = await inspect({
      organizationId: ORG_NORTH,
      documentId: body.documentId,
      revisionId,
      jobId: 'job-reject',
      requestId: 'req-reject',
    });
    expect(inspected.inspectionStatus).toBe('rejected');
    const loaded = await request(app)
      .get(`/organizations/${ORG_NORTH}/documents/${body.documentId}`)
      .set('Cookie', session.cookies);
    expect(publicDocumentSchema.parse(loaded.body).availableForSigning).toBe(false);
  });

  it('prepares, sends, and binds signer identity to the token', async () => {
    const { app, inspect } = testIngestionApp();
    const session = await loginAs(app, 'ada@example.test');
    const prepared = await sendPreparedDocument(app, inspect, session, 'prep-send');
    expect(prepared.urlToken.length).toBeGreaterThan(10);
    const signer = await exchangeSigner(app, prepared.urlToken);
    const opened = await request(app).get('/signing/session').set('Cookie', signer.cookies);
    expect(opened.status).toBe(200);
    expect(opened.headers['cache-control']).toBe('no-store');
    expect(opened.headers['referrer-policy']).toBe('no-referrer');
    expect(opened.headers['content-security-policy']).toContain("default-src 'none'");
    expect(signerSessionResponseSchema.parse(opened.body).signerId).toBe(prepared.signerId);
    expect(JSON.stringify(opened.body)).not.toContain(ORG_NORTH);

    const replay = await request(app)
      .post('/signing/exchange')
      .set('Origin', ORIGIN)
      .send({ token: prepared.urlToken });
    expect(replay.status).toBe(401);
    const unknown = await request(app)
      .post('/signing/exchange')
      .set('Origin', ORIGIN)
      .send({ token: 'not-a-token' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(replay.body.error.message);

    const extraIds = await request(app)
      .post('/signing/consent')
      .set('Origin', ORIGIN)
      .set('Cookie', signer.cookies)
      .set('x-csrf-token', signer.csrf)
      .send({
        copyId: 'esign-disclosure-v1',
        accepted: true,
        signerId: USER_BEAU,
        organizationId: ORG_SOUTH,
        documentId: prepared.documentId,
      });
    expect(extraIds.status).toBe(400);

    const moved = await request(app)
      .put(`/organizations/${ORG_NORTH}/documents/${prepared.documentId}/fields`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .send({
        fields: [
          {
            signerId: prepared.signerId,
            type: 'signature',
            pageNumber: 1,
            x: 0.6,
            y: 0.6,
            width: 0.2,
            height: 0.1,
          },
        ],
      });
    expect(moved.status).toBe(409);

    const revoked = await request(app)
      .post(
        `/organizations/${ORG_NORTH}/documents/${prepared.documentId}/sessions/${prepared.sessionId}/revoke`,
      )
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .send({});
    expect(revoked.status).toBe(200);
    const afterRevoke = await request(app).get('/signing/session').set('Cookie', signer.cookies);
    expect(afterRevoke.status).toBe(401);

    const beau = await loginAs(app, 'beau@example.test');
    const crossPrepare = await request(app)
      .put(`/organizations/${ORG_NORTH}/documents/${prepared.documentId}/signers`)
      .set('Origin', ORIGIN)
      .set('Cookie', beau.cookies)
      .set('x-csrf-token', beau.csrf)
      .send({
        signingMode: 'parallel',
        signers: [{ email: 'beau@example.test', displayName: 'Beau', routingOrder: 1 }],
      });
    expect(crossPrepare.status).toBe(403);
  });
});

describe('signer-facing API', () => {
  it('records viewed and consent, then declines without leaking tenant data', async () => {
    const { app, inspect, clock } = testIngestionApp();
    const owner = await loginAs(app, 'ada@example.test');
    const first = await sendPreparedDocument(app, inspect, owner, 'signer-a');
    const second = await sendPreparedDocument(app, inspect, owner, 'signer-b');
    const signer = await exchangeSigner(app, first.urlToken);
    const other = await exchangeSigner(app, second.urlToken);

    const firstSession = signerSessionResponseSchema.parse(
      (await request(app).get('/signing/session').set('Cookie', signer.cookies)).body,
    );
    const secondSession = signerSessionResponseSchema.parse(
      (await request(app).get('/signing/session').set('Cookie', other.cookies)).body,
    );
    expect(firstSession.documentId).toBe(first.documentId);
    expect(secondSession.documentId).toBe(second.documentId);
    expect(firstSession.documentId).not.toBe(secondSession.documentId);

    const viewed = await request(app)
      .post('/signing/viewed')
      .set('Origin', ORIGIN)
      .set('Cookie', signer.cookies)
      .set('x-csrf-token', signer.csrf)
      .send({});
    expect(viewed.status).toBe(200);

    const consent = signerConsentResponseSchema.parse(
      (await request(app).get('/signing/consent').set('Cookie', signer.cookies)).body,
    );
    const recorded = await request(app)
      .post('/signing/consent')
      .set('Origin', ORIGIN)
      .set('Cookie', signer.cookies)
      .set('x-csrf-token', signer.csrf)
      .send({ copyId: consent.copyId, accepted: true });
    expect(recorded.status).toBe(200);
    recordSignerConsentResponseSchema.parse(recorded.body);

    const fields = signerFieldsResponseSchema.parse(
      (await request(app).get('/signing/fields').set('Cookie', signer.cookies)).body,
    );
    expect(fields.fields).toHaveLength(1);

    const declined = await request(app)
      .post('/signing/decline')
      .set('Origin', ORIGIN)
      .set('Cookie', signer.cookies)
      .set('x-csrf-token', signer.csrf)
      .send({ reason: 'Not this time' });
    expect(declined.status).toBe(200);
    expect(declineToSignResponseSchema.parse(declined.body).status).toBe('declined');
    expect(JSON.stringify(declined.body)).not.toContain(ORG_NORTH);

    const afterDecline = await request(app).get('/signing/session').set('Cookie', signer.cookies);
    expect(afterDecline.status).toBe(401);

    clock.set('2026-09-18T12:00:00.000Z');
    const expired = await request(app).get('/signing/session').set('Cookie', other.cookies);
    expect(expired.status).toBe(401);
    expect(expired.body.error.message).toBe(afterDecline.body.error.message);
  });
});
