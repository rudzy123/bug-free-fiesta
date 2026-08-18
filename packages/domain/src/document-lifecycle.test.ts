import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from './errors.js';
import { assertDocumentTransition, canTransitionDocument } from './document-lifecycle.js';

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
});
