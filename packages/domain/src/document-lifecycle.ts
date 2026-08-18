import { InvalidStateTransitionError } from './errors.js';
import {
  DOCUMENT_STATES,
  type Document,
  type DocumentInspectionStatus,
  type DocumentState,
} from './entities.js';

export const DOCUMENT_TRANSITIONS: Readonly<Record<DocumentState, readonly DocumentState[]>> = {
  draft: ['sent', 'voided'],
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

export function canTransitionDocument(from: DocumentState, to: DocumentState): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export function assertDocumentTransition(from: DocumentState, to: DocumentState): void {
  if (!canTransitionDocument(from, to)) {
    throw new InvalidStateTransitionError({ from, to, aggregate: 'document' });
  }
}

export function isDocumentState(value: string): value is DocumentState {
  return (DOCUMENT_STATES as readonly string[]).includes(value);
}

export function isInspectionAccepted(status: DocumentInspectionStatus): boolean {
  return status === 'accepted';
}

/**
 * Signing is allowed only after inspection has accepted the source PDF and the
 * document has been sent. Draft documents stay unavailable even with a revision.
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

export function assertReadyToSend(document: Document): void {
  if (document.state !== 'draft') {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      from: document.state,
      to: 'sent',
      reason: 'not_draft',
    });
  }
  if (document.currentRevisionId === null) {
    throw new InvalidStateTransitionError({
      aggregate: 'document',
      from: 'draft',
      to: 'sent',
      reason: 'missing_revision',
    });
  }
  assertInspectionAccepted(document);
}
