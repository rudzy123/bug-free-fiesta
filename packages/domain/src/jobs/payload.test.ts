import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import { assertSafeJobPayload } from './payload.js';

const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444';
const REVISION_ID = '88888888-8888-4888-8888-888888888888';

describe('assertSafeJobPayload', () => {
  it('accepts opaque internal ids only', () => {
    expect(() =>
      assertSafeJobPayload({ documentId: DOCUMENT_ID, revisionId: REVISION_ID }),
    ).not.toThrow();
  });

  it('rejects raw tokens, signature images, and PDF bytes', () => {
    expect(() => assertSafeJobPayload({ rawToken: 'not-a-uuid' })).toThrow(ValidationError);
    expect(() => assertSafeJobPayload({ signaturePng: DOCUMENT_ID })).toThrow(ValidationError);
    expect(() => assertSafeJobPayload({ pdfBytes: DOCUMENT_ID })).toThrow(ValidationError);
  });

  it('rejects non-uuid values', () => {
    expect(() => assertSafeJobPayload({ documentId: 'not-opaque' })).toThrow(ValidationError);
  });
});
