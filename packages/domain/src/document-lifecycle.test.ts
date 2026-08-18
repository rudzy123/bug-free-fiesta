import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from './errors.js';
import {
  assertDocumentTransition,
  assertReadyToSend,
  canTransitionDocument,
  isAvailableForSigning,
} from './document-lifecycle.js';

describe('document lifecycle', () => {
  it('allows documented transitions', () => {
    expect(canTransitionDocument('draft', 'sent')).toBe(true);
    expect(canTransitionDocument('in_progress', 'in_progress')).toBe(true);
    expect(canTransitionDocument('finalization_failed', 'finalizing')).toBe(true);
  });

  it('rejects illegal transitions with InvalidStateTransitionError', () => {
    expect(canTransitionDocument('finalized', 'voided')).toBe(false);
    expect(() => assertDocumentTransition('finalized', 'draft')).toThrow(
      InvalidStateTransitionError,
    );
    try {
      assertDocumentTransition('completed', 'voided');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStateTransitionError);
      expect((error as InvalidStateTransitionError).details).toMatchObject({
        from: 'completed',
        to: 'voided',
      });
    }
  });

  it('keeps documents unavailable for signing until inspection is accepted', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    const draft = {
      id: '44444444-4444-4444-8444-444444444444',
      organizationId: '11111111-1111-4111-8111-111111111111',
      ownerMembershipId: '77777777-7777-4777-8777-777777777777',
      title: 'NDA',
      state: 'draft' as const,
      inspectionStatus: 'pending' as const,
      sourceDisplayName: 'nda.pdf',
      expiresAt: null,
      currentRevisionId: '88888888-8888-4888-8888-888888888888',
      signingRevisionId: null,
      version: 1,
      leaseOwner: null,
      leaseUntil: null,
      finalizationAttemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    expect(isAvailableForSigning(draft)).toBe(false);
    expect(() => assertReadyToSend(draft)).toThrow(InvalidStateTransitionError);
    const acceptedDraft = { ...draft, inspectionStatus: 'accepted' as const };
    expect(isAvailableForSigning(acceptedDraft)).toBe(false);
    expect(() => assertReadyToSend(acceptedDraft)).not.toThrow();
    expect(
      isAvailableForSigning({
        ...acceptedDraft,
        state: 'sent',
        signingRevisionId: acceptedDraft.currentRevisionId,
      }),
    ).toBe(true);
  });
});
