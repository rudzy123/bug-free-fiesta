import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import { assertApprovedAuditPayload } from './payload.js';

describe('approved audit payload', () => {
  it('accepts opaque ids, hashes, consent version, and untrusted request metadata', () => {
    expect(() =>
      assertApprovedAuditPayload({
        documentId: '44444444-4444-4444-8444-444444444444',
        signerId: '55555555-5555-4555-8555-555555555555',
        signingSessionId: '66666666-6666-4666-8666-666666666666',
        correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourceSha256: 'a'.repeat(64),
        finalizedSha256: 'b'.repeat(64),
        signaturePngSha256: 'c'.repeat(64),
        consentVersion: 'esign-disclosure-v1',
        untrustedClientIp: '203.0.113.9',
        untrustedUserAgent: 'vitest',
        signatureFieldId: '77777777-7777-4777-8777-777777777777',
      }),
    ).not.toThrow();
  });

  it('rejects secrets, cookies, bearer tokens, and raw artifacts', () => {
    const forbidden = [
      { bearerToken: 'abc' },
      { cookie: 'sid=1' },
      { authorization: 'Bearer abc' },
      { password: 'x' },
      { pdfBytes: 'JVBERi0' },
      { pngBytes: 'iVBORw0K' },
      { pointerStream: [{ x: 1 }] },
      { signatureImage: 'raw' },
      { email: 'a@example.invalid' },
      { strokes: [] },
    ];
    for (const payload of forbidden) {
      expect(() => assertApprovedAuditPayload(payload)).toThrow(ValidationError);
    }
  });
});
