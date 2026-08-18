import { InvalidStateTransitionError } from './errors.js';
import { DOCUMENT_STATES, type DocumentState } from './entities.js';

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
