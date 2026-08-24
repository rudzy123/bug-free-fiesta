import { Router } from 'express';
import type { ApiConfig } from '@esign/config';
import {
  documentIdParamSchema,
  organizationAuditVerificationReportSchema,
  organizationIdParamSchema,
  auditVerificationReportSchema,
} from '@esign/contracts';
import { ValidationError } from '@esign/domain';
import type {
  AssertAccountAction,
  ResolveAccountSession,
  ResolveOrganizationActor,
  VerifyAuditChain,
  VerifyOrganizationAuditChains,
} from '@esign/application';
import type { SigningTokenHasher } from '@esign/domain';
import { asyncRoute } from '../async-route.js';
import {
  createRequireAccountSession,
  createRequireCsrf,
} from '../middleware/require-account-session.js';
import { createRequireOrganizationMembership } from '../middleware/require-organization-membership.js';
import { createRequireAllowedOrigin } from '../middleware/require-origin.js';

export type AuditVerificationRouterDeps = {
  config: ApiConfig;
  resolveSession: ResolveAccountSession;
  resolveActor: ResolveOrganizationActor;
  hasher: SigningTokenHasher;
  assertAction: AssertAccountAction;
  verifyDocument: VerifyAuditChain;
  verifyOrganization: VerifyOrganizationAuditChains;
};

export function createAuditVerificationRouter(deps: AuditVerificationRouterDeps): Router {
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

  router.post(
    '/organizations/:organizationId/documents/:documentId/audit/verify',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'audit.verify' });
      const organizationId = parseOrganizationId(req.params.organizationId);
      const documentId = parseDocumentId(req.params.documentId);
      const report = await deps.verifyDocument({
        organizationId,
        documentId,
        actor,
      });
      res.status(200).json(auditVerificationReportSchema.parse(report));
    }),
  );

  router.post(
    '/organizations/:organizationId/audit/verify',
    requireOrigin,
    requireSession,
    requireCsrf,
    requireMembership,
    asyncRoute(async (req, res) => {
      const actor = req.accountActor;
      if (actor === undefined) {
        throw new Error('missing account actor after middleware');
      }
      deps.assertAction({ actor, action: 'audit.verify' });
      const organizationId = parseOrganizationId(req.params.organizationId);
      const report = await deps.verifyOrganization({
        organizationId,
        actor,
      });
      res.status(200).json(organizationAuditVerificationReportSchema.parse(report));
    }),
  );

  return router;
}

function parseOrganizationId(value: string | string[] | undefined): string {
  const parsed = organizationIdParamSchema.safeParse(typeof value === 'string' ? value : undefined);
  if (!parsed.success) {
    throw new ValidationError({ field: 'organizationId', reason: 'invalid' });
  }
  return parsed.data;
}

function parseDocumentId(value: string | string[] | undefined): string {
  const parsed = documentIdParamSchema.safeParse(typeof value === 'string' ? value : undefined);
  if (!parsed.success) {
    throw new ValidationError({ field: 'documentId', reason: 'invalid' });
  }
  return parsed.data;
}
