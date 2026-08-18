import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizationError,
  NotFoundError,
  type Document,
  type DocumentRepository,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createLoadDocument } from './load-document.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '44444444-4444-4444-8444-444444444444';
const USER = '33333333-3333-4333-8333-333333333333';

function document(organizationId = ORG): Document {
  const now = new Date('2026-08-17T12:00:00.000Z');
  return {
    id: DOC,
    organizationId,
    ownerMembershipId: '77777777-7777-4777-8777-777777777777',
    title: 'NDA',
    state: 'draft',
    signingMode: 'ordered',
    inspectionStatus: 'pending',
    sourceDisplayName: null,
    expiresAt: null,
    currentRevisionId: null,
    signingRevisionId: null,
    version: 1,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function repo(findById: DocumentRepository['findById']): DocumentRepository {
  return {
    findById,
    listByOrganization: vi.fn(),
    create: vi.fn(),
    attachSourceRevision: vi.fn(),
    setInspectionStatus: vi.fn(),
    setSigningMode: vi.fn(),
    setPreparationState: vi.fn(),
    markSent: vi.fn(),
  };
}

describe('loadDocument', () => {
  it('loads a document using the actor organization id', async () => {
    const findById = vi.fn(async () => document());
    const loadDocument = createLoadDocument({
      documents: repo(findById),
      authorization: createMembershipAuthorizationPolicy(),
    });
    const result = await loadDocument({
      actor: {
        type: 'account_user',
        userId: USER,
        membership: {
          membershipId: '77777777-7777-4777-8777-777777777777',
          organizationId: ORG,
          role: 'member',
        },
      },
      documentId: DOC,
    });
    expect(result.organizationId).toBe(ORG);
    expect(findById).toHaveBeenCalledWith({ organizationId: ORG, documentId: DOC });
  });

  it('looks up the document only in the actor tenant', async () => {
    const findById = vi.fn(async () => null);
    const loadDocument = createLoadDocument({
      documents: repo(findById),
      authorization: createMembershipAuthorizationPolicy(),
    });
    await expect(
      loadDocument({
        actor: {
          type: 'account_user',
          userId: USER,
          membership: {
            membershipId: '77777777-7777-4777-8777-777777777777',
            organizationId: OTHER,
            role: 'owner',
          },
        },
        documentId: DOC,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith({ organizationId: OTHER, documentId: DOC });
  });

  it('does not query when authorization fails', async () => {
    const findById = vi.fn();
    const loadDocument = createLoadDocument({
      documents: repo(findById),
      authorization: createMembershipAuthorizationPolicy(),
    });
    await expect(
      loadDocument({
        actor: {
          type: 'signer',
          organizationId: ORG,
          documentId: DOC,
          signerId: USER,
          sessionId: '66666666-6666-4666-8666-666666666666',
        },
        documentId: DOC,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(findById).not.toHaveBeenCalled();
  });
});
