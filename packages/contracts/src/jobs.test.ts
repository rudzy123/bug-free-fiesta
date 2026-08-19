import { describe, expect, it } from 'vitest';
import {
  inspectDocumentJobPayloadSchema,
  notifySignerJobPayloadSchema,
  flattenSignatureJobPayloadSchema,
} from './jobs.js';

const ID = '44444444-4444-4444-8444-444444444444';

describe('job payload contracts', () => {
  it('accepts opaque ids and rejects extra fields', () => {
    expect(inspectDocumentJobPayloadSchema.parse({ documentId: ID, revisionId: ID })).toEqual({
      documentId: ID,
      revisionId: ID,
    });
    expect(() =>
      inspectDocumentJobPayloadSchema.parse({ documentId: ID, revisionId: ID, token: 'x' }),
    ).toThrow();
    expect(() => notifySignerJobPayloadSchema.parse({ signerId: ID, sessionId: 'nope' })).toThrow();
    expect(
      flattenSignatureJobPayloadSchema.parse({
        documentId: ID,
        signerId: ID,
        sessionId: ID,
        revisionId: ID,
      }),
    ).toEqual({ documentId: ID, signerId: ID, sessionId: ID, revisionId: ID });
    expect(() =>
      flattenSignatureJobPayloadSchema.parse({
        documentId: ID,
        signerId: ID,
        sessionId: ID,
        revisionId: ID,
        png: 'x',
      }),
    ).toThrow();
  });
});
