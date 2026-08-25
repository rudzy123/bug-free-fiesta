import { describe, expect, it } from 'vitest';
import { completeSigningRequestSchema } from './documents.js';

describe('completeSigningRequestSchema (SEC-021)', () => {
  it('accepts PNG-only ink payloads', () => {
    const parsed = completeSigningRequestSchema.parse({
      consentCopyId: 'esign-disclosure-v1',
      intentToSign: true,
      fieldIds: ['11111111-1111-4111-8111-111111111111'],
      signature: { pngBase64: 'aGVsbG8=' },
    });
    expect(parsed.signature).toEqual({ pngBase64: 'aGVsbG8=' });
  });

  it('rejects unused stroke payloads', () => {
    const result = completeSigningRequestSchema.safeParse({
      consentCopyId: 'esign-disclosure-v1',
      intentToSign: true,
      fieldIds: ['11111111-1111-4111-8111-111111111111'],
      signature: {
        pngBase64: 'aGVsbG8=',
        strokes: [{ points: [{ x: 0.1, y: 0.2, t: 0, p: 0.5 }] }],
        durationMs: 12,
      },
    });
    expect(result.success).toBe(false);
  });
});
