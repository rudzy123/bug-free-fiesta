import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import { assertApprovedAuditPayload } from './payload.js';

describe('approved audit payloads', () => {
  it('accepts opaque ids and hashes', () => {
    expect(() =>
      assertApprovedAuditPayload({
        documentId: '22222222-2222-4222-8222-222222222222',
        finalizedSha256: 'a'.repeat(64),
        consentVersion: '1',
      }),
    ).not.toThrow();
  });

  it('rejects secrets, cookies, tokens, and raw media', () => {
    expect(() => assertApprovedAuditPayload({ token: 'secret' })).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ cookie: 'sid=1' })).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ authorization: 'Bearer x' })).toThrow(
      ValidationError,
    );
    expect(() => assertApprovedAuditPayload({ pdfBytes: 'JVBERi0' })).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ signatureImage: 'iVBOR' })).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ pointerStream: [1, 2] })).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ email: 'ada@example.test' })).toThrow(
      ValidationError,
    );
  });

  it('rejects nested forbidden keys and binary values', () => {
    expect(() =>
      assertApprovedAuditPayload({ meta: { bearerToken: 'abc' } }),
    ).toThrow(ValidationError);
    expect(() => assertApprovedAuditPayload({ blob: new Uint8Array([1, 2]) })).toThrow(
      ValidationError,
    );
  });
});
