import {
  AuthenticationError,
  AuthorizationError,
  organizationContext,
  type AccountUser,
  type AccountUserActor,
  type AuthorizationAction,
  type AuthorizationPolicy,
  type MembershipRepository,
  type OrganizationMembership,
  type OrganizationContext,
  type UserRepository,
} from '@esign/domain';

export function createLoadCurrentAccountUser(deps: { users: UserRepository }) {
  return async function loadCurrentAccountUser(input: { userId: string }): Promise<{
    user: AccountUser;
    memberships: readonly OrganizationMembership[];
  }> {
    const user = await deps.users.findById({ userId: input.userId });
    if (!user) {
      throw new AuthenticationError({ reason: 'account_user_missing' });
    }
    const memberships = await deps.users.listMemberships({ userId: input.userId });
    return { user, memberships };
  };
}

export type LoadCurrentAccountUser = ReturnType<typeof createLoadCurrentAccountUser>;

export function createResolveOrganizationActor(deps: { memberships: MembershipRepository }) {
  return async function resolveOrganizationActor(input: {
    userId: string;
    organizationId: string;
  }): Promise<{ actor: AccountUserActor; organization: OrganizationContext }> {
    const organization = organizationContext(input.organizationId);
    const membership = await deps.memberships.findByUser({
      organizationId: organization.organizationId,
      userId: input.userId,
    });
    if (!membership) {
      throw new AuthorizationError({ reason: 'organization_membership_missing' });
    }
    return {
      organization,
      actor: {
        type: 'account_user',
        userId: input.userId,
        membership: {
          membershipId: membership.id,
          organizationId: membership.organizationId,
          role: membership.role,
        },
      },
    };
  };
}

export type ResolveOrganizationActor = ReturnType<typeof createResolveOrganizationActor>;

export function createAssertAccountAction(deps: { authorization: AuthorizationPolicy }) {
  return function assertAccountAction(input: {
    actor: AccountUserActor;
    action: AuthorizationAction;
  }): void {
    deps.authorization.assertAllowed(input.actor, input.action, {
      organizationId: input.actor.membership.organizationId,
    });
  };
}

export type AssertAccountAction = ReturnType<typeof createAssertAccountAction>;
