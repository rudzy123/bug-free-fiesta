import { AuthorizationError } from './errors.js';
import { organizationContext, type OrganizationContext } from './organization-context.js';

export const MEMBERSHIP_ROLES = ['owner', 'admin', 'member', 'read_only'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export type AccountUserActor = {
  readonly type: 'account_user';
  readonly userId: string;
  readonly membership: {
    readonly membershipId: string;
    readonly organizationId: string;
    readonly role: MembershipRole;
  };
};

export type SignerActor = {
  readonly type: 'signer';
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
};

export type WorkerActor = {
  readonly type: 'worker';
  readonly jobId: string;
  readonly organizationId: string;
};

export type SystemActor = {
  readonly type: 'system';
};

export type RequestActor = AccountUserActor | SignerActor | WorkerActor | SystemActor;

export function organizationContextFromActor(actor: RequestActor): OrganizationContext {
  switch (actor.type) {
    case 'account_user':
      return organizationContext(actor.membership.organizationId);
    case 'signer':
      return organizationContext(actor.organizationId);
    case 'worker':
      return organizationContext(actor.organizationId);
    case 'system':
      throw new AuthorizationError({ reason: 'system_requires_explicit_organization' });
  }
}

export function actorId(actor: RequestActor): string {
  switch (actor.type) {
    case 'account_user':
      return actor.userId;
    case 'signer':
      return actor.signerId;
    case 'worker':
      return actor.jobId;
    case 'system':
      return 'system';
  }
}

export function actorType(actor: RequestActor): 'account_user' | 'signer' | 'worker' | 'system' {
  return actor.type;
}
