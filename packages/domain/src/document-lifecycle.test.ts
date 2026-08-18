import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from './errors.js';
import {
  DOCUMENT_STATES,
  SIGNING_SESSION_STATUSES,
  type Document,
  type DocumentState,
} from './entities.js';
import {
  DOCUMENT_TRANSITIONS,
  SIGNING_SESSION_TRANSITIONS,
  assertDocumentTransition,
  assertPreparationUnlocked,
  assertReadyToSend,
  assertSigningSessionTransition,
  canTransitionDocument,
  canTransitionSigningSession,
  isAvailableForSigning,
  isPreparationLocked,
} from './document-lifecycle.js';
import { assertSignerRouting, canSignerActNow } from './signing-mode.js';
import { assertFieldLayout } from './field-geometry.js';
import { ValidationError } from './errors.js';

function document(overrides: Partial<Document> = {}): Document {
  const now = new Date('2026-08-18T12:00:00.000Z');
  return {
    id: '44444444-4444-4444-8444-444444444444',
    organizationId: '11111111-1111-4111-8111-111111111111',
    ownerMembershipId: '77777777-7777-4777-8777-777777777777',
    title: 'NDA',
    state: 'draft',
    signingMode: 'ordered',
    inspectionStatus: 'pending',
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
    ...overrides,
  };
}

describe('document lifecycle', () => {
  it('allows documented transitions and forbids every other pair', () => {
    for (const from of DOCUMENT_STATES) {
      const allowed = new Set(DOCUMENT_TRANSITIONS[from]);
      for (const to of DOCUMENT_STATES) {
        expect(canTransitionDocument(from, to), `${from} -> ${to}`).toBe(allowed.has(to));
        if (allowed.has(to)) {
          expect(() => assertDocumentTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertDocumentTransition(from, to)).toThrow(InvalidStateTransitionError);
        }
      }
    }
  });

  it('rejects illegal transitions with InvalidStateTransitionError details', () => {
    expect(canTransitionDocument('finalized', 'voided')).toBe(false);
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

  it('keeps documents unavailable for signing until inspection is accepted and sent', () => {
    const draft = document();
    expect(isAvailableForSigning(draft)).toBe(false);
    expect(() => assertReadyToSend(draft)).toThrow(InvalidStateTransitionError);
    const acceptedDraft = document({ inspectionStatus: 'accepted' });
    expect(isAvailableForSigning(acceptedDraft)).toBe(false);
    expect(() => assertReadyToSend(acceptedDraft)).not.toThrow();
    const prepared = document({ state: 'prepared', inspectionStatus: 'accepted' });
    expect(isAvailableForSigning(prepared)).toBe(false);
    expect(() => assertReadyToSend(prepared)).not.toThrow();
    expect(
      isAvailableForSigning(
        document({
          state: 'sent',
          inspectionStatus: 'accepted',
          signingRevisionId: '88888888-8888-4888-8888-888888888888',
        }),
      ),
    ).toBe(true);
  });

  it('locks preparation after send and later states', () => {
    expect(isPreparationLocked(document({ state: 'draft' }))).toBe(false);
    expect(isPreparationLocked(document({ state: 'prepared' }))).toBe(false);
    expect(() => assertPreparationUnlocked(document({ state: 'sent' }))).toThrow(
      InvalidStateTransitionError,
    );
    const locked: DocumentState[] = [
      'sent',
      'in_progress',
      'completed',
      'finalizing',
      'finalized',
      'voided',
      'expired',
      'declined',
      'finalization_failed',
    ];
    for (const state of locked) {
      expect(isPreparationLocked(document({ state })), state).toBe(true);
    }
  });
});

describe('signing session lifecycle', () => {
  it('allows documented session transitions and forbids every other pair', () => {
    for (const from of SIGNING_SESSION_STATUSES) {
      const allowed = new Set(SIGNING_SESSION_TRANSITIONS[from]);
      for (const to of SIGNING_SESSION_STATUSES) {
        expect(canTransitionSigningSession(from, to), `${from} -> ${to}`).toBe(allowed.has(to));
        if (allowed.has(to)) {
          expect(() => assertSigningSessionTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertSigningSessionTransition(from, to)).toThrow(
            InvalidStateTransitionError,
          );
        }
      }
    }
  });
});

describe('signing mode and field layout', () => {
  it('requires consecutive unique routing for ordered mode', () => {
    expect(() =>
      assertSignerRouting({
        signingMode: 'ordered',
        signers: [{ routingOrder: 1 }, { routingOrder: 3 }],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertSignerRouting({
        signingMode: 'parallel',
        signers: [{ routingOrder: 1 }, { routingOrder: 2 }],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertSignerRouting({
        signingMode: 'ordered',
        signers: [{ routingOrder: 1 }, { routingOrder: 2 }],
      }),
    ).not.toThrow();
  });

  it('rejects fields outside the page or overlapping when prohibited', () => {
    const onPage = { pageNumber: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.1 };
    expect(() =>
      assertFieldLayout({
        fields: [{ ...onPage, pageNumber: 2 }],
        pageCount: 1,
        overlapPolicy: 'allow',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertFieldLayout({
        fields: [onPage, { pageNumber: 1, x: 0.15, y: 0.12, width: 0.2, height: 0.1 }],
        pageCount: 1,
        overlapPolicy: 'prohibit',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertFieldLayout({
        fields: [onPage, { pageNumber: 1, x: 0.5, y: 0.5, width: 0.2, height: 0.1 }],
        pageCount: 1,
        overlapPolicy: 'prohibit',
      }),
    ).not.toThrow();
  });

  it('allows the current ordered signer and any pending parallel signer to act', () => {
    const first = { id: 'a', routingOrder: 1, status: 'pending' as const };
    const second = { id: 'b', routingOrder: 2, status: 'pending' as const };
    expect(
      canSignerActNow({ signingMode: 'ordered', actor: first, signers: [first, second] }),
    ).toBe(true);
    expect(
      canSignerActNow({ signingMode: 'ordered', actor: second, signers: [first, second] }),
    ).toBe(false);
    const parallel = { ...second, routingOrder: 1 };
    expect(
      canSignerActNow({
        signingMode: 'parallel',
        actor: parallel,
        signers: [{ ...first, routingOrder: 1 }, parallel],
      }),
    ).toBe(true);
  });
});
