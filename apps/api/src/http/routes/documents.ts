import express, { Router } from 'express';
import type { ApiConfig } from '@esign/config';
import {
  createDocumentRequestSchema,
  createDocumentResponseSchema,
  documentIdParamSchema,
  issuePreviewResponseSchema,
  organizationIdParamSchema,
  previewGrantIdParamSchema,
  publicDocumentSchema,
  replaceFieldsRequestSchema,
  replaceSignersRequestSchema,
  rotateSessionResponseSchema,
  revokeSessionResponseSchema,
  sendDocumentRequestSchema,
  sendDocumentResponseSchema,
  sessionIdParamSchema,
  signerIdParamSchema,
} from '@esign/contracts';
import { ValidationError } from '@esign/domain';
import type {
  CompleteSourceUpload,
  CreateDraftDocument,
  GetOrganizationDocument,
  IssueDocumentPreview,
  ReplaceDocumentFields,
  ReplaceDocumentSigners,
  RevokeSigningSession,
  RotateSigningSession,
  SendDocument,
  StreamDocumentPreview,
  AssertAccountAction,
} from '@esign/application';
import { asyncRoute } from '../async-route.js';
import {
  createRequireAccountSession,
  createRequireCsrf,
} from '../middleware/require-account-session.js';
import { createRequireOrganizationMembership } from '../middleware/require-organization-membership.js';
import { createRequireAllowedOrigin } from '../middleware/require-origin.js';
import type { ResolveAccountSession, ResolveOrganizationActor } from '@esign/application';
import type { SigningTokenHasher } from '@esign/domain';

export type DocumentIngestionRouterDeps = {
  config: ApiConfig;
  resolveSession: ResolveAccountSession;
  resolveActor: ResolveOrganizationActor;
  hasher: SigningTokenHasher;
  assertAction: AssertAccountAction;
  createDraft: CreateDraftDocument;
  completeUpload: CompleteSourceUpload;
  getDocument: GetOrganizationDocument;
  issuePreview: IssueDocumentPreview;
  streamPreview: StreamDocumentPreview;
  replaceSigners: ReplaceDocumentSigners;
  replaceFields: ReplaceDocumentFields;
  sendDocument: SendDocument;
  rotateSession: RotateSigningSession;
  revokeSession: RevokeSigningSession;
};

export function createDocumentIngestionRouter(deps: DocumentIngestionRouterDeps): Router {
  const requireOrigin = createRequireAllowedOrigin(deps.config.CORS_ORIGINS);
  const requireSession = createRequireAccountSession({
    resolveSession: deps.resolveSession,
    sessionCookieName: deps.config.AUTH_SESSION_COOKIE_NAME,
  });
  const requireCsrf = createRequireCsrf({
    csrfCookieName: deps.config.AUTH_CSRF_COOKIE_NAME,
    csrfHeaderName: deps.config.AUTH_CSRF_HEADER_NAME,
    hasher: deps.hasher,
  });
  const requireMembership = createRequireOrganizationMembership({
    resolveActor: deps.resolveActor,
  });

  const router = Router();
  // JSON bodies for organization-scoped endpoints. Scoped to /organizations so
  // it does not run for the raw PDF upload path or the signing routes. The
  // parser is a no-op for the application/pdf upload (handled by express.raw).
  router.use('/organizations', express.json({ limit: deps.config.JSON_BODY_LIMIT }));
  const rawPdf = express.raw({
    type: ['application/pdf', 'application/octet-stream'],
    limit: deps.config.DOCUMENT_MAX_UPLOAD_BYTES,
  });

  router.post(
    '/organizations/:organizationId/documents',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.write' });
      const parsed = createDocumentRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_create_document' });
      }
      const result = await deps.createDraft({
        actor,
        title: parsed.data.title,
        filename: parsed.data.filename,
        idempotencyKey: headerValue(req, 'idempotency-key') ?? '',
        requestId: req.correlationId,
      });
      res.status(201).json(createDocumentResponseSchema.parse(result));
    }),
  );

  router.get(
    '/organizations/:organizationId/documents/:documentId',
    requireSession,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      const documentId = parseDocumentId(req.params.documentId);
      const result = await deps.getDocument({ actor, documentId });
      res.status(200).json(publicDocumentSchema.parse(result));
    }),
  );

  router.post(
    '/organizations/:organizationId/documents/:documentId/previews',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      const documentId = parseDocumentId(req.params.documentId);
      const result = await deps.issuePreview({ actor, documentId });
      res.status(201).json(issuePreviewResponseSchema.parse(result));
    }),
  );

  router.put(
    '/organizations/:organizationId/documents/:documentId/source',
    rawPdf,
    asyncRoute(async (req, res) => {
      const organizationId = parseOrganizationId(req.params.organizationId);
      const documentId = parseDocumentId(req.params.documentId);
      const token = headerValue(req, deps.config.DOCUMENT_UPLOAD_TOKEN_HEADER);
      if (token === undefined) {
        throw new ValidationError({
          field: deps.config.DOCUMENT_UPLOAD_TOKEN_HEADER,
          reason: 'missing',
        });
      }
      const body = requestBytes(req.body);
      const result = await deps.completeUpload({
        organizationId,
        documentId,
        rawToken: token,
        contentType: req.header('content-type'),
        body,
        requestId: req.correlationId,
      });
      res.status(200).json(publicDocumentSchema.parse(result));
    }),
  );

  router.get(
    '/document-previews/:grantId',
    asyncRoute(async (req, res) => {
      const grantId = parseGrantId(req.params.grantId);
      const token = headerValue(req, deps.config.DOCUMENT_PREVIEW_TOKEN_HEADER);
      if (token === undefined) {
        throw new ValidationError({
          field: deps.config.DOCUMENT_PREVIEW_TOKEN_HEADER,
          reason: 'missing',
        });
      }
      const result = await deps.streamPreview({ grantId, rawToken: token });
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${result.displayName.replaceAll('"', '')}"`,
      );
      res.status(200).send(Buffer.from(result.body));
    }),
  );

  router.put(
    '/organizations/:organizationId/documents/:documentId/signers',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.write' });
      const parsed = replaceSignersRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_signers' });
      }
      const result = await deps.replaceSigners({
        actor,
        documentId: parseDocumentId(req.params.documentId),
        signingMode: parsed.data.signingMode,
        signers: parsed.data.signers,
        requestId: req.correlationId,
      });
      res.status(200).json(publicDocumentSchema.parse(result));
    }),
  );

  router.put(
    '/organizations/:organizationId/documents/:documentId/fields',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.write' });
      const parsed = replaceFieldsRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_fields' });
      }
      const result = await deps.replaceFields({
        actor,
        documentId: parseDocumentId(req.params.documentId),
        overlapPolicy: deps.config.DOCUMENT_FIELD_OVERLAP_POLICY,
        fields: parsed.data.fields,
        requestId: req.correlationId,
      });
      res.status(200).json(publicDocumentSchema.parse(result));
    }),
  );

  router.post(
    '/organizations/:organizationId/documents/:documentId/send',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.send' });
      const parsed = sendDocumentRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError({ reason: 'invalid_send' });
      }
      const result = await deps.sendDocument({
        actor,
        documentId: parseDocumentId(req.params.documentId),
        expiresAt: parsed.data.expiresAt,
        idempotencyKey: headerValue(req, 'idempotency-key') ?? '',
        requestId: req.correlationId,
      });
      res.status(200).json(sendDocumentResponseSchema.parse(result));
    }),
  );

  router.post(
    '/organizations/:organizationId/documents/:documentId/signers/:signerId/sessions/rotate',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.send' });
      const result = await deps.rotateSession({
        actor,
        documentId: parseDocumentId(req.params.documentId),
        signerId: parseSignerId(req.params.signerId),
        requestId: req.correlationId,
      });
      res.status(201).json(rotateSessionResponseSchema.parse(result));
    }),
  );

  router.post(
    '/organizations/:organizationId/documents/:documentId/sessions/:sessionId/revoke',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'document.send' });
      const result = await deps.revokeSession({
        actor,
        documentId: parseDocumentId(req.params.documentId),
        sessionId: parseSessionId(req.params.sessionId),
        requestId: req.correlationId,
      });
      res.status(200).json(revokeSessionResponseSchema.parse(result));
    }),
  );

  return router;
}

function parseOrganizationId(value: string | string[] | undefined): string {
  const parsed = organizationIdParamSchema.safeParse(singleParam(value));
  if (!parsed.success) {
    throw new ValidationError({ field: 'organizationId', reason: 'invalid' });
  }
  return parsed.data;
}

function parseDocumentId(value: string | string[] | undefined): string {
  const parsed = documentIdParamSchema.safeParse(singleParam(value));
  if (!parsed.success) {
    throw new ValidationError({ field: 'documentId', reason: 'invalid' });
  }
  return parsed.data;
}

function parseGrantId(value: string | string[] | undefined): string {
  const parsed = previewGrantIdParamSchema.safeParse(singleParam(value));
  if (!parsed.success) {
    throw new ValidationError({ field: 'grantId', reason: 'invalid' });
  }
  return parsed.data;
}

function parseSignerId(value: string | string[] | undefined): string {
  const parsed = signerIdParamSchema.safeParse(singleParam(value));
  if (!parsed.success) {
    throw new ValidationError({ field: 'signerId', reason: 'invalid' });
  }
  return parsed.data;
}

function parseSessionId(value: string | string[] | undefined): string {
  const parsed = sessionIdParamSchema.safeParse(singleParam(value));
  if (!parsed.success) {
    throw new ValidationError({ field: 'sessionId', reason: 'invalid' });
  }
  return parsed.data;
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

function requestBytes(body: unknown): Uint8Array {
  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body);
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  throw new ValidationError({ reason: 'empty_body' });
}
