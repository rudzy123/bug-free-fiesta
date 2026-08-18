import {
  AuthorizationError,
  type AuthorizationAction,
  type AuthorizationPolicy,
  type AuthorizationResource,
  type RequestActor,
} from '@esign/domain';

const ACCOUNT_USER_ACTIONS: Readonly<Record<string, readonly AuthorizationAction[]>> = {
  owner: [
    'organization.membership.read',
    'document.read',
    'document.write',
    'document.send',
    'document.void',
    'document.download_artifact',
  ],
  admin: [
    'organization.membership.read',
    'document.read',
    'document.write',
    'document.send',
    'document.void',
    'document.download_artifact',
  ],
  member: ['organization.membership.read', 'document.read', 'document.write', 'document.send'],
};

function deny(details: Record<string, unknown>): never {
  throw new AuthorizationError(details);
}

function sameOrganization(actorOrg: string, resource: AuthorizationResource): boolean {
  return actorOrg === resource.organizationId;
}

export function createMembershipAuthorizationPolicy(): AuthorizationPolicy {
  return {
    assertAllowed(
      actor: RequestActor,
      action: AuthorizationAction,
      resource: AuthorizationResource,
    ) {
      switch (actor.type) {
        case 'account_user': {
          if (!sameOrganization(actor.membership.organizationId, resource)) {
            deny({ reason: 'organization_mismatch', action });
          }
          const allowed = ACCOUNT_USER_ACTIONS[actor.membership.role];
          if (!allowed?.includes(action)) {
            deny({ reason: 'role_denied', action, role: actor.membership.role });
          }
          return;
        }
        case 'signer': {
          if (action !== 'signing.session.act') {
            deny({ reason: 'signer_action_denied', action });
          }
          if (!sameOrganization(actor.organizationId, resource)) {
            deny({ reason: 'organization_mismatch', action });
          }
          if (resource.documentId !== undefined && resource.documentId !== actor.documentId) {
            deny({ reason: 'document_mismatch', action });
          }
          if (resource.signerId !== undefined && resource.signerId !== actor.signerId) {
            deny({ reason: 'signer_mismatch', action });
          }
          return;
        }
        case 'worker': {
          if (action !== 'job.process') {
            deny({ reason: 'worker_action_denied', action });
          }
          if (!sameOrganization(actor.organizationId, resource)) {
            deny({ reason: 'organization_mismatch', action });
          }
          return;
        }
        case 'system': {
          if (action !== 'job.process') {
            deny({ reason: 'system_action_denied', action });
          }
          return;
        }
      }
    },
  };
}
