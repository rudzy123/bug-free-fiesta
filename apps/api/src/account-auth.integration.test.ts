import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import {
  createAssertAccountAction,
  createCompleteSourceUpload,
  createCreateDraftDocument,
  createGetOrganizationDocument,
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
  createMemorySignatureFieldStore,
  createMemorySignerStore,
  createMemorySigningSessionStore,
  createMemoryNotifier,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
  createMemoryUserRepository,
  createReplaceDocumentFields,
  createReplaceDocumentSigners,
  createResolveAccountSession,
  createResolveOrganizationActor,
  createRevokeAccountSession,
  createRevokeSigningSession,
  createRotateSigningSession,
  createSendDocument,
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createSizeLimitedObjectStorage,
  createStreamDocumentPreview,
  createUuidIdGenerator,
} from '@esign/application';
import {
  currentAccountUserResponseSchema,
  errorEnvelopeSchema,
  organizationActorResponseSchema,
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
const USER_CORA = '33333333-3333-4333-8333-333333333334';
const MEMBERSHIP_NORTH_ADA = '55555555-5555-4555-8555-555555555551';
const MEMBERSHIP_SOUTH_BEAU = '55555555-5555-4555-8555-555555555553';
const MEMBERSHIP_SOUTH_CORA = '55555555-5555-4555-8555-555555555554';
const ORIGIN = 'http://localhost:3000';
const SHARED_SECRET = 'local-dev-only-shared-secret';
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

function accountUser(id: string, email: string, displayName: string): AccountUser {
  const createdAt = new Date(START);
  return { id, email, displayName, createdAt, updatedAt: createdAt };
}

function membership(
  id: string,
  organizationId: string,
  userId: string,
  role: OrganizationMembership['role'],
): OrganizationMembership {
  const createdAt = new Date(START);
  return { id, organizationId, userId, role, createdAt, updatedAt: createdAt };
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

function setCookieLines(response: request.Response): string[] {
  const raw = response.headers['set-cookie'];
  if (raw === undefined) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function testAuthApp(clock: Clock & { set: (iso: string) => void } = nowClock()) {
  const config = loadApiConfig(
    apiEnv({ AUTH_SESSION_TTL_SECONDS: '60', AUTH_LOGIN_RATE_LIMIT_MAX: '50' }),
  );
  const logger = createLogger({ name: 'api-auth-test', level: 'silent' });
  const hashing = createSha256Hashing();
  const hasher = createSigningTokenHasher(hashing);
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const users = createMemoryUserRepository([
    accountUser(USER_ADA, 'ada@example.test', 'Ada Example'),
    accountUser(USER_BEAU, 'beau@example.test', 'Beau Example'),
    accountUser(USER_CORA, 'cora@example.test', 'Cora Example'),
  ]);
  const adaMemberships = [
    membership(MEMBERSHIP_NORTH_ADA, ORG_NORTH, USER_ADA, 'owner'),
    membership('55555555-5555-4555-8555-555555555552', ORG_SOUTH, USER_ADA, 'member'),
  ];
  const beauMemberships = [membership(MEMBERSHIP_SOUTH_BEAU, ORG_SOUTH, USER_BEAU, 'owner')];
  const coraMemberships = [membership(MEMBERSHIP_SOUTH_CORA, ORG_SOUTH, USER_CORA, 'read_only')];
  users.setMemberships(USER_ADA, adaMemberships);
  users.setMemberships(USER_BEAU, beauMemberships);
  users.setMemberships(USER_CORA, coraMemberships);
  const memberships = createMemoryMembershipRepository([
    ...adaMemberships,
    ...beauMemberships,
    ...coraMemberships,
  ]);
  const sessions = createMemoryAccountSessionRepository();
  const audit = createMemoryAccountSecurityAuditWriter();
  const identityProvider = createLocalIdentityProvider({
    hashing,
    sharedSecret: SHARED_SECRET,
    findByEmail: (email) => users.findByEmail({ email }),
  });
  const authorization = createMembershipAuthorizationPolicy();
  const documents = createMemoryDocumentRepository();
  const revisions = createMemoryDocumentRevisionRepository();
  const uploadSessions = createMemoryUploadSessionStore();
  const previewGrants = createMemoryPreviewGrantStore();
  const signers = createMemorySignerStore();
  const signatureFields = createMemorySignatureFieldStore();
  const signingSessions = createMemorySigningSessionStore();
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
    }),
  );
  const storage = createSizeLimitedObjectStorage(createMemoryObjectStorage(), 26_214_400);
  const resolveSession = createResolveAccountSession({ sessions, hasher, clock });
  const resolveActor = createResolveOrganizationActor({ memberships });
  const assertAction = createAssertAccountAction({ authorization });
  const app = createApiApp({
    config,
    logger,
    health: createHealthService({ ping: async () => undefined }),
    accountAuthRouter: createAccountAuthRouter({
      config,
      login: createLoginAccountUser({
        identityProvider,
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
  });
  return { app, config, clock, audit, sessions };
}

async function loginAs(
  app: ReturnType<typeof testAuthApp>['app'],
  email: string,
): Promise<{ cookies: string; csrf: string; userId: string }> {
  const response = await request(app)
    .post('/auth/login')
    .set('Origin', ORIGIN)
    .send({ email, secret: SHARED_SECRET });
  expect(response.status).toBe(200);
  const cookies = cookieHeader(response);
  const csrf = cookieValue(cookies, 'esign_csrf');
  expect(csrf).toBeDefined();
  return { cookies, csrf: csrf ?? '', userId: response.body.userId };
}

describe('account authentication and authorization', () => {
  it('rejects unauthenticated access to organization context', async () => {
    const { app } = testAuthApp();
    const response = await request(app).get(`/organizations/${ORG_NORTH}/me`);
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('authentication');
  });

  it('rejects a read_only role from a write action', async () => {
    const { app } = testAuthApp();
    const session = await loginAs(app, 'cora@example.test');
    const allowed = await request(app)
      .get(`/organizations/${ORG_SOUTH}/me`)
      .set('Cookie', session.cookies);
    expect(allowed.status).toBe(200);
    expect(organizationActorResponseSchema.parse(allowed.body).role).toBe('read_only');

    const denied = await request(app)
      .post(`/organizations/${ORG_SOUTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf);
    expect(denied.status).toBe(403);
    expect(errorEnvelopeSchema.parse(denied.body).error.code).toBe('forbidden');
  });

  it('rejects the wrong organization even when the client sends another organization id', async () => {
    const { app } = testAuthApp();
    const session = await loginAs(app, 'beau@example.test');
    const response = await request(app)
      .get(`/organizations/${ORG_NORTH}/me`)
      .set('Cookie', session.cookies)
      .set('x-organization-id', ORG_SOUTH);
    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('forbidden');

    const write = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .send({ organizationId: ORG_SOUTH });
    expect(write.status).toBe(403);
  });

  it('rejects a revoked session', async () => {
    const { app } = testAuthApp();
    const session = await loginAs(app, 'ada@example.test');
    const logout = await request(app)
      .post('/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf);
    expect(logout.status).toBe(204);

    const response = await request(app).get('/auth/me').set('Cookie', session.cookies);
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('authentication');
  });

  it('rejects an expired session', async () => {
    const clock = nowClock();
    const { app } = testAuthApp(clock);
    const session = await loginAs(app, 'ada@example.test');
    clock.set('2026-08-18T12:02:00.000Z');
    const response = await request(app)
      .get(`/organizations/${ORG_NORTH}/me`)
      .set('Cookie', session.cookies);
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('authentication');
  });

  it('rejects cookie-authenticated mutations without a CSRF token', async () => {
    const { app } = testAuthApp();
    const session = await loginAs(app, 'ada@example.test');
    const missing = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies);
    expect(missing.status).toBe(403);
    expect(errorEnvelopeSchema.parse(missing.body).error.code).toBe('forbidden');

    const mismatch = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', 'not-the-csrf-token');
    expect(mismatch.status).toBe(403);
  });

  it('allows an authorized owner to read organization context and perform a write action', async () => {
    const { app, audit } = testAuthApp();
    const session = await loginAs(app, 'ada@example.test');
    const me = await request(app).get('/auth/me').set('Cookie', session.cookies);
    expect(me.status).toBe(200);
    const profile = currentAccountUserResponseSchema.parse(me.body);
    expect(profile.userId).toBe(USER_ADA);
    expect(profile.memberships.map((row) => row.organizationId).sort()).toEqual(
      [ORG_NORTH, ORG_SOUTH].sort(),
    );

    const orgMe = await request(app)
      .get(`/organizations/${ORG_NORTH}/me`)
      .set('Cookie', session.cookies);
    expect(orgMe.status).toBe(200);
    expect(organizationActorResponseSchema.parse(orgMe.body)).toMatchObject({
      userId: USER_ADA,
      organizationId: ORG_NORTH,
      role: 'owner',
    });

    const write = await request(app)
      .post(`/organizations/${ORG_NORTH}/documents`)
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .set('Idempotency-Key', 'auth-write-probe-key')
      .send({ title: 'Auth probe', filename: 'probe.pdf' });
    expect(write.status).toBe(201);
    expect(write.body.documentId).toEqual(expect.any(String));
    expect(JSON.stringify(audit.events)).not.toContain(SHARED_SECRET);
    expect(JSON.stringify(audit.events)).not.toContain('ada@example.test');
  });

  it('sets HttpOnly Secure-capable session cookies and SameSite flags', async () => {
    const { app } = testAuthApp();
    const response = await request(app)
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'ada@example.test', secret: SHARED_SECRET });
    expect(response.status).toBe(200);
    const lines = setCookieLines(response);
    const sessionLine = lines.find((line) => line.startsWith('esign_sid='));
    const csrfLine = lines.find((line) => line.startsWith('esign_csrf='));
    expect(sessionLine).toMatch(/HttpOnly/i);
    expect(sessionLine).toMatch(/SameSite=Lax/i);
    expect(csrfLine).not.toMatch(/HttpOnly/i);
    expect(csrfLine).toMatch(/SameSite=Strict/i);
  });

  it('does not distinguish unknown emails from invalid secrets', async () => {
    const { app, audit } = testAuthApp();
    const unknown = await request(app)
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'missing@example.test', secret: SHARED_SECRET });
    const wrong = await request(app)
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'ada@example.test', secret: 'wrong-secret-value' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(JSON.stringify(unknown.body)).not.toContain('missing@example.test');
    expect(JSON.stringify(audit.events)).not.toContain('missing@example.test');
    expect(JSON.stringify(audit.events)).not.toContain('wrong-secret-value');
  });

  it('issues a new session cookie after login when a prior session cookie is present', async () => {
    const { app } = testAuthApp();
    const first = await loginAs(app, 'ada@example.test');
    const second = await request(app)
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .set('Cookie', first.cookies)
      .send({ email: 'ada@example.test', secret: SHARED_SECRET });
    expect(second.status).toBe(200);
    const rotated = await request(app).get('/auth/me').set('Cookie', first.cookies);
    expect(rotated.status).toBe(401);
    const stillValid = await request(app).get('/auth/me').set('Cookie', cookieHeader(second));
    expect(stillValid.status).toBe(200);
  });

  it('revokes only sessions owned by the authenticated user', async () => {
    const { app } = testAuthApp();
    const session = await loginAs(app, 'ada@example.test');
    const revoke = await request(app)
      .post('/auth/sessions/revoke')
      .set('Origin', ORIGIN)
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .send({ sessionId: '11111111-1111-4111-8111-111111111199' });
    expect(revoke.status).toBe(401);
    const stillValid = await request(app).get('/auth/me').set('Cookie', session.cookies);
    expect(stillValid.status).toBe(200);
  });
});
