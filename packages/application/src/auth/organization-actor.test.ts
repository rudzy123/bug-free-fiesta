import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createMemoryMembershipRepository, createMemoryUserRepository } from './memory-adapters.js';
import { createAssertAccountAction, createResolveOrganizationActor } from './organization-actor.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '55555555-5555-4555-8555-555555555551';
const NOW = new Date('2026-08-18T12:00:00.000Z');

describe('organization actor resolution', () => {
  it('builds the actor from persisted membership, not from a client organization id', async () => {
    const memberships = createMemoryMembershipRepository([
      {
        id: MEMBERSHIP,
        organizationId: ORG,
        userId: USER,
        role: 'member',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const resolve = createResolveOrganizationActor({ memberships });
    const result = await resolve({ userId: USER, organizationId: ORG });
    expect(result.actor.membership.organizationId).toBe(ORG);
    expect(result.actor.membership.role).toBe('member');
    await expect(resolve({ userId: USER, organizationId: OTHER })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('denies write actions for a read_only membership', () => {
    const assertAction = createAssertAccountAction({
      authorization: createMembershipAuthorizationPolicy(),
    });
    expect(() =>
      assertAction({
        actor: {
          type: 'account_user',
          userId: USER,
          membership: { membershipId: MEMBERSHIP, organizationId: ORG, role: 'read_only' },
        },
        action: 'document.write',
      }),
    ).toThrow(AuthorizationError);
  });
});

describe('memory user repository', () => {
  it('lists memberships for an account user without taking organizationId from the client', async () => {
    const users = createMemoryUserRepository([
      {
        id: USER,
        email: 'ada@example.test',
        displayName: 'Ada',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    users.setMemberships(USER, [
      {
        id: MEMBERSHIP,
        organizationId: ORG,
        userId: USER,
        role: 'owner',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    const listed = await users.listMemberships({ userId: USER });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.organizationId).toBe(ORG);
  });
});
