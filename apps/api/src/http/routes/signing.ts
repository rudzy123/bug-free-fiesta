import { Router } from 'express';
import type { ApiConfig } from '@esign/config';
import {
  declineToSignRequestSchema,
  declineToSignResponseSchema,
  exchangeSigningTokenRequestSchema,
  exchangeSigningTokenResponseSchema,
  issuePreviewResponseSchema,
  recordSignerConsentRequestSchema,
  recordSignerConsentResponseSchema,
  recordSignerViewedResponseSchema,
  signerConsentResponseSchema,
  signerDocumentResponseSchema,
  signerFieldsResponseSchema,
  signerSessionResponseSchema,
} from '@esign/contracts';
import {
  clientRequestMetadataFromHeaders,
  type DeclineToSign,
  type ExchangeSigningToken,
  type GetSignerConsent,
  type GetSignerDocument,
  type GetSignerFields,
  type GetSignerSession,
  type IssueSignerPreview,
  type RecordSignerConsent,
  type RecordSignerViewed,
} from '@esign/application';
import {
  ValidationError,
  AuthenticationError,
  type RateLimiter,
  type SigningTokenHasher,
} from '@esign/domain';
import { asyncRoute } from '../async-route.js';
import { setSessionCookies, type SessionCookieSettings } from '../cookies.js';
import { createRequireAllowedOrigin } from '../middleware/require-origin.js';
import {
  createRequireSignerCsrf,
  createRequireSignerToken,
  createSigningRateLimit,
  createSigningResponseHeaders,
  extractExchangeToken,
} from '../middleware/require-signer-session.js';

export type SigningRouterDeps = {
  config: ApiConfig;
  hasher: SigningTokenHasher;
  rateLimiter: RateLimiter;
  loadCsrfHash: (rawToken: string) => Promise<string | null>;
  exchange: ExchangeSigningToken;
  getSession: GetSignerSession;
  getDocument: GetSignerDocument;
  getFields: GetSignerFields;
  getConsent: GetSignerConsent;
  issuePreview: IssueSignerPreview;
  recordViewed: RecordSignerViewed;
  recordConsent: RecordSignerConsent;
  decline: DeclineToSign;
};

export function createSigningRouter(deps: SigningRouterDeps): Router {
  const settings: SessionCookieSettings = {
    sessionCookieName: deps.config.SIGNING_SESSION_COOKIE_NAME,
    csrfCookieName: deps.config.SIGNING_CSRF_COOKIE_NAME,
    secure: deps.config.AUTH_COOKIE_SECURE,
    maxAgeSeconds: deps.config.SIGNING_SESSION_TTL_SECONDS,
    path: '/signing',
  };
  const requireOrigin = createRequireAllowedOrigin(deps.config.CORS_ORIGINS);
  const headers = createSigningResponseHeaders();
  const rateLimit = createSigningRateLimit(deps.rateLimiter);
  const requireToken = createRequireSignerToken({
    sessionCookieName: settings.sessionCookieName,
  });
  const requireCsrf = createRequireSignerCsrf({
    csrfCookieName: settings.csrfCookieName,
    csrfHeaderName: deps.config.AUTH_CSRF_HEADER_NAME,
    hasher: deps.hasher,
    loadCsrfHash: deps.loadCsrfHash,
  });

  const router = Router();
  router.use('/signing', headers, rateLimit);

  router.post(
    '/signing/exchange',
    requireOrigin,
    asyncRoute(async (req, res) => {
      const parsed = exchangeSigningTokenRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_exchange' });
      }
      const rawToken = extractExchangeToken({
        bodyToken: parsed.data.token,
        authorization: req.header('authorization'),
        queryToken: typeof req.query.token === 'string' ? req.query.token : undefined,
      });
      const result = await deps.exchange({
        rawToken,
        requestId: req.correlationId,
      });
      setSessionCookies(res, settings, {
        sessionToken: result.rawSessionToken,
        csrfToken: result.rawCsrfToken,
      });
      res.status(200).json(
        exchangeSigningTokenResponseSchema.parse({
          sessionId: result.sessionId,
          expiresAt: result.expiresAt,
        }),
      );
    }),
  );

  router.get(
    '/signing/session',
    requireToken,
    asyncRoute(async (req, res) => {
      const result = await deps.getSession({ rawToken: requireSigningToken(req) });
      res.status(200).json(signerSessionResponseSchema.parse(result));
    }),
  );

  router.get(
    '/signing/document',
    requireToken,
    asyncRoute(async (req, res) => {
      const result = await deps.getDocument({ rawToken: requireSigningToken(req) });
      res.status(200).json(signerDocumentResponseSchema.parse(result));
    }),
  );

  router.get(
    '/signing/fields',
    requireToken,
    asyncRoute(async (req, res) => {
      const fields = await deps.getFields({ rawToken: requireSigningToken(req) });
      res.status(200).json(signerFieldsResponseSchema.parse({ fields }));
    }),
  );

  router.get(
    '/signing/consent',
    requireToken,
    asyncRoute(async (req, res) => {
      const result = await deps.getConsent({ rawToken: requireSigningToken(req) });
      res.status(200).json(signerConsentResponseSchema.parse(result));
    }),
  );

  router.post(
    '/signing/previews',
    requireOrigin,
    requireToken,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const result = await deps.issuePreview({ rawToken: requireSigningToken(req) });
      res.status(201).json(issuePreviewResponseSchema.parse(result));
    }),
  );

  router.post(
    '/signing/viewed',
    requireOrigin,
    requireToken,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const result = await deps.recordViewed({
        rawToken: requireSigningToken(req),
        requestId: req.correlationId,
      });
      res.status(200).json(recordSignerViewedResponseSchema.parse(result));
    }),
  );

  router.post(
    '/signing/consent',
    requireOrigin,
    requireToken,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = recordSignerConsentRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_consent' });
      }
      const result = await deps.recordConsent({
        rawToken: requireSigningToken(req),
        copyId: parsed.data.copyId,
        accepted: parsed.data.accepted,
        requestId: req.correlationId,
        metadata: metadataFromRequest(req),
      });
      res.status(200).json(recordSignerConsentResponseSchema.parse(result));
    }),
  );

  router.post(
    '/signing/decline',
    requireOrigin,
    requireToken,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = declineToSignRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_decline' });
      }
      const result = await deps.decline({
        rawToken: requireSigningToken(req),
        reason: parsed.data.reason,
        requestId: req.correlationId,
        metadata: metadataFromRequest(req),
      });
      res.status(200).json(declineToSignResponseSchema.parse(result));
    }),
  );

  return router;
}

function requireSigningToken(req: { signingToken?: string }): string {
  if (req.signingToken === undefined || req.signingToken === '') {
    throw new AuthenticationError({ reason: 'signing_token' });
  }
  return req.signingToken;
}

function metadataFromRequest(req: {
  ip?: string;
  header: (name: string) => string | undefined;
}): ReturnType<typeof clientRequestMetadataFromHeaders> {
  return clientRequestMetadataFromHeaders({
    forwardedFor: req.header('x-forwarded-for'),
    remoteAddress: req.ip,
    userAgent: req.header('user-agent'),
  });
}
