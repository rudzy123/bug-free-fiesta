import { InvalidStateTransitionError } from './errors.js';
import {
  DOCUMENT_STATES,
  SIGNING_SESSION_STATUSES,
  type Document,
  type DocumentInspectionStatus,
  type DocumentState,
  type SigningSession,
  type SigningSessionStatus,
} from './entities.js';

export const DOCUMENT_TRANSITIONS: Readonly<Record<DocumentState, readonly DocumentState[]>> = {
  draft: ['prepared', 'sent', 'voided'],
  prepared: ['draft', 'sent', 'voided'],
  sent: ['in_progress', 'completed', 'voided', 'expired', 'declined'],
  in_progress: ['in_progress', 'completed', 'voided', 'expired', 'declined'],
  completed: ['finalizing'],
  finalizing: ['finalized', 'finalization_failed'],
  finalization_failed: ['finalizing'],
  finalized: [],
  voided: [],
  expired: [],
  declined: [],
};

export const SIGNING_SESSION_TRANSITIONS: Readonly<
  Record<SigningSessionStatus, readonly SigningSessionStatus[]>
> = {
  issued: ['active', 'expired', 'revoked'],
  active: ['completed', 'expired', 'revoked'],
  completed: [],
  expired: [],
  revoked: [],
};

export function canTransitionDocument(from: DocumentState, to: DocumentState): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export function assertDocumentTransition(from: DocumentState, to: DocumentState): void {
  if (!canTransitionDocument(from, to)) {
    throw new InvalidStateTransitionError({ from, to, aggregate: 'document' });
  }
}

export function canTransitionSigningSession(
  from: SigningSessionStatus,
  to: SigningSessionStatus,
): boolean {
  return SIGNING_SESSION_TRANSITIONS[from].includes(to);
}

export function assertSigningSessionTransition(
  from: SigningSessionStatus,
  to: SigningSessionStatus,
): void {
  if (!canTransitionSigningSession(from, to)) {
    throw new InvalidStateTransitionError({ from, to, aggregate: 'signing_session' });
  }
}

export function isDocumentState(value: string): value is DocumentState {
  return (DOCUMENT_STATES as readonly string[]).includes(value);
}

export function isSigningSessionStatus(value: string): value is SigningSessionStatus {
  return (SIGNING_SESSION_STATUSES as readonly string[]).includes(value);
}

export function isInspectionAccepted(status: DocumentInspectionStatus): boolean {
  return status === 'accepted';
}

export function isPreparationState(state: DocumentState): boolean {
  return state === 'draft' || state === 'prepared';
}

export function isPreparationLocked(document: Document): boolean {
  return !isPreparationState(document.state);
}

/**
 * Signing is allowed only after inspection has accepted the source PDF and the
 * document has been sent. Draft and prepared documents stay unavailable.
 */
export function isAvailableForSigning(document: Document): boolean {
  return (
    isInspectionAccepted(document.inspectionStatus) &&
    (document.state === 'sent' || document.state === 'in_progress')
  );
}

export function assertInspectionAccepted(document: Document): void {
  if (!isInspectionAccepted(document.inspectionStatus)) {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      reason: 'inspection_not_accepted',
      inspectionStatus: document.inspectionStatus,
    });
  }
}

export function assertPreparationUnlocked(document: Document): void {
  if (isPreparationLocked(document)) {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      from: document.state,
      reason: 'preparation_locked',
    });
  }
}

export function assertReadyToSend(document: Document): void {
  if (!isPreparationState(document.state)) {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      from: document.state,
      to: 'sent',
      reason: 'not_preparable',
    });
  }
  if (document.currentRevisionId === null) {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      from: document.state,
      to: 'sent',
      reason: 'missing_revision',
    });
  }
  assertInspectionAccepted(document);
}

export function isOpenSigningSession(session: SigningSession, now: Date): boolean {
  return (
    (session.status === 'issued' || session.status === 'active') &&
    session.expiresAt.getTime() > now.getTime() &&
    session.revokedAt === null
  );
}
