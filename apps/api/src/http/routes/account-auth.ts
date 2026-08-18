import { Router } from 'express';
import type { ApiConfig } from '@esign/config';
import {
  currentAccountUserResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  organizationActorResponseSchema,
  revokeSessionRequestSchema,
} from '@esign/contracts';
import {
  RateLimitError,
  ValidationError,
  type Hashing,
  type RateLimiter,
  type SigningTokenHasher,
} from '@esign/domain';
import type {
  AssertAccountAction,
  LoadCurrentAccountUser,
  LoginAccountUser,
  LogoutAccountUser,
  ResolveAccountSession,
  ResolveOrganizationActor,
  RevokeAccountSession,
} from '@esign/application';
import { asyncRoute } from '../async-route.js';
import { clearSessionCookies, setSessionCookies, type SessionCookieSettings } from '../cookies.js';
import {
  createRequireAccountSession,
  createRequireCsrf,
} from '../middleware/require-account-session.js';
import { createRequireOrganizationMembership } from '../middleware/require-organization-membership.js';
import { createRequireAllowedOrigin } from '../middleware/require-origin.js';

export type AccountAuthRouterDeps = {
  config: ApiConfig;
  login: LoginAccountUser;
  logout: LogoutAccountUser;
  revokeSession: RevokeAccountSession;
  resolveSession: ResolveAccountSession;
  resolveActor: ResolveOrganizationActor;
  loadCurrentUser: LoadCurrentAccountUser;
  assertAction: AssertAccountAction;
  hasher: SigningTokenHasher;
  hashing: Hashing;
  loginRateLimiter: RateLimiter;
};

export function createAccountAuthRouter(deps: AccountAuthRouterDeps): Router {
  const settings: SessionCookieSettings = {
    sessionCookieName: deps.config.AUTH_SESSION_COOKIE_NAME,
    csrfCookieName: deps.config.AUTH_CSRF_COOKIE_NAME,
    secure: deps.config.AUTH_COOKIE_SECURE,
    maxAgeSeconds: deps.config.AUTH_SESSION_TTL_SECONDS,
  };
  const requireOrigin = createRequireAllowedOrigin(deps.config.CORS_ORIGINS);
  const requireSession = createRequireAccountSession({
    resolveSession: deps.resolveSession,
    sessionCookieName: settings.sessionCookieName,
  });
  const requireCsrf = createRequireCsrf({
    csrfCookieName: settings.csrfCookieName,
    csrfHeaderName: deps.config.AUTH_CSRF_HEADER_NAME,
    hasher: deps.hasher,
  });
  const requireMembership = createRequireOrganizationMembership({
    resolveActor: deps.resolveActor,
  });

  const router = Router();

  router.post(
    '/auth/login',
    requireOrigin,
    asyncRoute(async (req, res) => {
      await consumeLoginRateLimit(deps, req.ip ?? 'unknown', req.body);
      const parsed = loginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_login' });
      }
      const existing = req.cookies.get(settings.sessionCookieName);
      const result = await deps.login({
        email: parsed.data.email,
        secret: parsed.data.secret,
        requestId: req.correlationId,
        existingSessionTokenHash: existing ? deps.hasher.hash(existing) : null,
      });
      setSessionCookies(res, settings, {
        sessionToken: result.rawSessionToken,
        csrfToken: result.rawCsrfToken,
      });
      const body = loginResponseSchema.parse({
        userId: result.user.id,
        expiresAt: result.session.expiresAt.toISOString(),
      });
      res.status(200).json(body);
    }),
  );

  router.post(
    '/auth/logout',
    requireOrigin,
    requireSession,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const session = req.accountSession;
      if (session === undefined) {
        throw new Error('missing account session after middleware');
      }
      await deps.logout({ session, requestId: req.correlationId });
      clearSessionCookies(res, settings);
      res.status(204).end();
    }),
  );

  router.post(
    '/auth/sessions/revoke',
    requireOrigin,
    requireSession,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const session = req.accountSession;
      if (session === undefined) {
        throw new Error('missing account session after middleware');
      }
      const parsed = revokeSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError({ field: 'sessionId', reason: 'invalid' });
      }
      await deps.revokeSession({
        actorUserId: session.userId,
        sessionId: parsed.data.sessionId,
        requestId: req.correlationId,
      });
      if (parsed.data.sessionId === session.id) {
        clearSessionCookies(res, settings);
      }
      res.status(204).end();
    }),
  );

  router.get(
    '/auth/me',
    requireSession,
    asyncRoute(async (req, res) => {
      const session = req.accountSession;
      if (session === undefined) {
        throw new Error('missing account session after middleware');
      }
      const loaded = await deps.loadCurrentUser({ userId: session.userId });
      const body = currentAccountUserResponseSchema.parse({
        userId: loaded.user.id,
        displayName: loaded.user.displayName,
        memberships: loaded.memberships.map((membership) => ({
          membershipId: membership.id,
          organizationId: membership.organizationId,
          role: membership.role,
        })),
      });
      res.status(200).json(body);
    }),
  );

  router.get(
    '/organizations/:organizationId/me',
    requireSession,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'organization.membership.read' });
      const body = organizationActorResponseSchema.parse({
        userId: actor.userId,
        organizationId: actor.membership.organizationId,
        membershipId: actor.membership.membershipId,
        role: actor.membership.role,
      });
      res.status(200).json(body);
    }),
  );

  return router;
}

async function consumeLoginRateLimit(
  deps: AccountAuthRouterDeps,
  ip: string,
  body: unknown,
): Promise<void> {
  const ipDecision = await deps.loginRateLimiter.consume(`login:ip:${deps.hashing.sha256Hex(ip)}`);
  if (!ipDecision.allowed) {
    throw new RateLimitError({ retryAfterSeconds: ipDecision.retryAfterSeconds });
  }
  if (typeof body === 'object' && body !== null && 'email' in body) {
    const email = body.email;
    if (typeof email === 'string' && email.trim() !== '') {
      const emailDecision = await deps.loginRateLimiter.consume(
        `login:email:${deps.hashing.sha256Hex(email.trim().toLowerCase())}`,
      );
      if (!emailDecision.allowed) {
        throw new RateLimitError({ retryAfterSeconds: emailDecision.retryAfterSeconds });
      }
    }
  }
}
