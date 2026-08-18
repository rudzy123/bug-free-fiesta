import type { RequestHandler } from 'express';
import { organizationIdParamSchema } from '@esign/contracts';
import { ValidationError } from '@esign/domain';
import type { ResolveOrganizationActor } from '@esign/application';

export function createRequireOrganizationMembership(deps: {
  resolveActor: ResolveOrganizationActor;
}): RequestHandler {
  return (req, _res, next) => {
    const session = req.accountSession;
    if (session === undefined) {
      next(new Error('Organization middleware requires an account session'));
      return;
    }
    const parsed = organizationIdParamSchema.safeParse(req.params.organizationId);
    if (!parsed.success) {
      next(new ValidationError({ field: 'organizationId', reason: 'invalid' }));
      return;
    }
    void deps
      .resolveActor({ userId: session.userId, organizationId: parsed.data })
      .then((resolved) => {
        req.accountActor = resolved.actor;
        req.organization = resolved.organization;
        next();
      })
      .catch(next);
  };
}
