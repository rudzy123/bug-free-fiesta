import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@esign/domain';
import { createMembershipAuthorizationPolicy } from './membership-policy.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const SIGNER = '55555555-5555-4555-8555-555555555555';

describe('membership authorization policy', () => {
  const policy = createMembershipAuthorizationPolicy();

  it('allows an organization member to read a document in their tenant', () => {
    expect(() =>
      policy.assertAllowed(
        {
          type: 'account_user',
          userId: USER,
          membership: { organizationId: ORG, role: 'member' },
        },
        'document.read',
        { organizationId: ORG, documentId: DOC },
      ),
    ).not.toThrow();
  });

  it('denies cross-tenant access', () => {
    expect(() =>
      policy.assertAllowed(
        {
          type: 'account_user',
          userId: USER,
          membership: { organizationId: ORG, role: 'owner' },
        },
        'document.read',
        { organizationId: OTHER, documentId: DOC },
      ),
    ).toThrow(AuthorizationError);
  });

  it('denies a member from voiding a document', () => {
    expect(() =>
      policy.assertAllowed(
        {
          type: 'account_user',
          userId: USER,
          membership: { organizationId: ORG, role: 'member' },
        },
        'document.void',
        { organizationId: ORG, documentId: DOC },
      ),
    ).toThrow(AuthorizationError);
  });

  it('scopes signer actors to their bound document', () => {
    const signer = {
      type: 'signer' as const,
      organizationId: ORG,
      documentId: DOC,
      signerId: SIGNER,
      sessionId: '66666666-6666-4666-8666-666666666666',
    };
    expect(() =>
      policy.assertAllowed(signer, 'signing.session.act', {
        organizationId: ORG,
        documentId: DOC,
        signerId: SIGNER,
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertAllowed(signer, 'document.read', { organizationId: ORG, documentId: DOC }),
    ).toThrow(AuthorizationError);
  });
});
