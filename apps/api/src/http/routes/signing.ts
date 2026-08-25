import express, { Router } from 'express';
import type { ApiConfig } from '@esign/config';
import {
  completeSigningRequestSchema,
  completeSigningResponseSchema,
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
  type CompleteSigning,
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
  complete: CompleteSigning;
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
  router.use(
    '/signing',
    express.json({ limit: deps.config.SIGNING_JSON_BODY_LIMIT }),
    headers,
    rateLimit,
  );

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

  router.post(
    '/signing/complete',
    requireOrigin,
    requireToken,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = completeSigningRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_complete_signing' });
      }
      const result = await deps.complete({
        rawToken: requireSigningToken(req),
        consentCopyId: parsed.data.consentCopyId,
        intentToSign: parsed.data.intentToSign,
        fieldIds: parsed.data.fieldIds,
        signature: parsed.data.signature,
        initials: parsed.data.initials,
        idempotencyKey: headerValue(req, 'idempotency-key') ?? '',
        requestId: req.correlationId,
      });
      res.status(200).json(completeSigningResponseSchema.parse({ status: result.status }));
    }),
  );

  return router;
}

function headerValue(
  req: { header: (name: string) => string | undefined },
  name: string,
): string | undefined {
  const value = req.header(name)?.trim();
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

function requireSigningToken(req: { signingToken?: string }): string {
  if (req.signingToken === undefined || req.signingToken === '') {
    throw new AuthenticationError({ reason: 'signing_token' });
  }
  return req.signingToken;
}

function metadataFromRequest(req: {
  ip?: string;
  clientIp?: string;
  header: (name: string) => string | undefined;
}): ReturnType<typeof clientRequestMetadataFromHeaders> {
  // Use the spoof-resistant client IP resolved from the trusted-proxy topology.
  // The raw X-Forwarded-For header is intentionally not forwarded here so a
  // signer cannot poison consent/audit metadata with a forged source IP.
  return clientRequestMetadataFromHeaders({
    forwardedFor: undefined,
    remoteAddress: req.clientIp ?? req.ip,
    userAgent: req.header('user-agent'),
  });
}
