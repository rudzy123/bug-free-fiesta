import { describe, expect, it } from 'vitest';
import type { SignerField } from './signing-api';
import { emptySignaturePadState, reducePointer } from './signature/pointer';
import { buildCompleteRequest, submitReadiness } from './submit-readiness';

const field: SignerField = {
  fieldId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'signature',
  pageNumber: 1,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.1,
  required: true,
};

function validSignature() {
  let state = emptySignaturePadState;
  const rect = { left: 0, top: 0, width: 100, height: 50 };
  state = reducePointer(state, {
    kind: 'down',
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    pressure: 0.4,
    timeStamp: 0,
    rect,
  });
  for (let index = 1; index <= 8; index += 1) {
    state = reducePointer(state, {
      kind: 'move',
      pointerId: 1,
      clientX: 10 + index * 5,
      clientY: 10 + index,
      pressure: 0.4,
      timeStamp: index * 10,
      rect,
    });
  }
  return reducePointer(state, {
    kind: 'up',
    pointerId: 1,
    clientX: 50,
    clientY: 20,
    pressure: 0.4,
    timeStamp: 100,
    rect,
  });
}

describe('submit validation', () => {
  it('keeps submit disabled until signature, consent, and intent are present', () => {
    const empty = submitReadiness({
      consented: false,
      intentToSign: false,
      submitting: false,
      fields: [field],
      signature: emptySignaturePadState,
      initials: emptySignaturePadState,
    });
    expect(empty.canSubmit).toBe(false);
    expect(empty.reasons).toEqual(
      expect.arrayContaining([
        'Consent is required.',
        'Intent to sign is required.',
        'A signature is required.',
      ]),
    );

    const ready = submitReadiness({
      consented: true,
      intentToSign: true,
      submitting: false,
      fields: [field],
      signature: validSignature(),
      initials: emptySignaturePadState,
    });
    expect(ready.canSubmit).toBe(true);
  });

  it('blocks a second submit while finalization is pending', () => {
    const result = submitReadiness({
      consented: true,
      intentToSign: true,
      submitting: true,
      fields: [field],
      signature: validSignature(),
      initials: emptySignaturePadState,
    });
    expect(result.canSubmit).toBe(false);
    expect(result.reasons).toContain('Finalization is already in progress.');
  });

  it('sends field ids as intent and omits placement coordinates and tenant ids', () => {
    const request = buildCompleteRequest({
      consentCopyId: 'esign-consent-v3',
      fields: [field],
      signature: { pngBase64: 'aGVsbG8=', state: validSignature() },
      initials: undefined,
    });
    const serialized = JSON.stringify(request);
    expect(request.fieldIds).toEqual([field.fieldId]);
    expect(request.intentToSign).toBe(true);
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('"pageNumber"');
    expect(serialized).not.toContain('"width"');
    expect(request).not.toHaveProperty('x');
    expect(request).not.toHaveProperty('y');
  });
});
