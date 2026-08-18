import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import {
  createAssertAccountAction,
  createCleanupAbandonedUploads,
  createCompleteSourceUpload,
  createCreateDraftDocument,
  createDocumentInspector,
  createGetOrganizationDocument,
  createInspectDocument,
  createIssueDocumentPreview,
  createLoadCurrentAccountUser,
  createLocalIdentityProvider,
  createLoginAccountUser,
  createLogoutAccountUser,
  createMembershipAuthorizationPolicy,
  createMemoryAccountSecurityAuditWriter,
  createMemoryAccountSessionRepository,
  createMemoryAuditWriter,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryMembershipRepository,
  createMemoryObjectStorage,
  createMemoryPreviewGrantStore,
  createMemoryRateLimiter,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
  createMemoryUserRepository,
  createResolveAccountSession,
  createResolveOrganizationActor,
  createRevokeAccountSession,
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createSizeLimitedObjectStorage,
  createStreamDocumentPreview,
  createUuidIdGenerator,
  LOCAL_INSPECTOR_REJECT_MARKER,
} from '@esign/application';
import {
  createDocumentResponseSchema,
  errorEnvelopeSchema,
  publicDocumentSchema,
} from '@esign/contracts';
import type { AccountUser, Clock, OrganizationMembership } from '@esign/domain';
import { createHealthService } from './application/health-service.js';
import { createApiApp } from './create-app.js';
import { createAccountAuthRouter } from './http/routes/account-auth.js';
import { createDocumentIngestionRouter } from './http/routes/documents.js';

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
    documentRouter: createDocumentIngestionRouter({
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
      getDocument: createGetOrganizationDocument({ authorization, documents, revisions }),
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
    }),
  });
  return { app, config, clock, inspect, cleanup, jobs, hashing };
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
    expect(malformedType.status).toBe(400);
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
});
