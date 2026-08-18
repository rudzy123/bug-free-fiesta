import { describe, expect, it } from 'vitest';
import { AuthorizationError, ValidationError } from './errors.js';
import { organizationContext, requireOrganizationId } from './organization-context.js';
import { organizationContextFromActor, type RequestActor } from './request-actor.js';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('organization context', () => {
  it('rejects a missing organizationId', () => {
    expect(() => requireOrganizationId('')).toThrow(ValidationError);
    expect(() => requireOrganizationId('   ')).toThrow(ValidationError);
  });

  it('accepts an opaque organization id', () => {
    expect(organizationContext(ORG)).toEqual({ organizationId: ORG });
  });

  it('derives organization context from a request actor', () => {
    const actor: RequestActor = {
      type: 'account_user',
      userId: '22222222-2222-4222-8222-222222222222',
      membership: {
        membershipId: '77777777-7777-4777-8777-777777777777',
        organizationId: ORG,
        role: 'member',
      },
    };
    expect(organizationContextFromActor(actor).organizationId).toBe(ORG);
  });

  it('does not infer a tenant from a system actor', () => {
    expect(() => organizationContextFromActor({ type: 'system' })).toThrow(AuthorizationError);
  });
});
