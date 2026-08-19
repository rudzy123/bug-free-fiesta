import type { CompleteSigningRequest } from '@esign/contracts';
import { completeSigningRequestSchema } from '@esign/contracts';
import type { SignerField } from './signing-api';
import { SIGNATURE_BOUNDS } from './signature/bounds';
import {
  committedStrokes,
  isSignatureValid,
  signatureDurationMs,
  type SignaturePadState,
} from './signature/pointer';

export type InkCapture = {
  readonly pngBase64: string;
  readonly state: SignaturePadState;
};

export function submitReadiness(input: {
  readonly consented: boolean;
  readonly intentToSign: boolean;
  readonly submitting: boolean;
  readonly fields: readonly SignerField[];
  readonly signature: SignaturePadState;
  readonly initials: SignaturePadState;
}): { canSubmit: boolean; reasons: readonly string[] } {
  const reasons: string[] = [];
  if (input.submitting) {
    reasons.push('Finalization is already in progress.');
  }
  if (input.fields.length === 0) {
    reasons.push('No fields are assigned to complete.');
  }
  if (!input.consented) {
    reasons.push('Consent is required.');
  }
  if (!input.intentToSign) {
    reasons.push('Intent to sign is required.');
  }
  if (needsInk(input.fields, 'signature') && !isSignatureValid(input.signature)) {
    reasons.push('A signature is required.');
  }
  if (needsInk(input.fields, 'initials') && !isSignatureValid(input.initials)) {
    reasons.push('Initials are required.');
  }
  return { canSubmit: reasons.length === 0, reasons };
}

export function buildCompleteRequest(input: {
  readonly consentCopyId: string;
  readonly fields: readonly SignerField[];
  readonly signature: InkCapture | undefined;
  readonly initials: InkCapture | undefined;
}): CompleteSigningRequest {
  const request: CompleteSigningRequest = {
    consentCopyId: input.consentCopyId,
    intentToSign: true,
    fieldIds: input.fields.map((field) => field.fieldId),
  };
  if (input.signature !== undefined) {
    request.signature = toInkPayload(input.signature);
  }
  if (input.initials !== undefined) {
    request.initials = toInkPayload(input.initials);
  }
  return completeSigningRequestSchema.parse(request);
}

export function needsInk(fields: readonly SignerField[], type: 'signature' | 'initials'): boolean {
  return fields.some((field) => field.required && field.type === type);
}

function toInkPayload(capture: InkCapture) {
  return {
    pngBase64: capture.pngBase64,
    durationMs: signatureDurationMs(capture.state),
    strokes: committedStrokes(capture.state)
      .slice(0, SIGNATURE_BOUNDS.maxStrokes)
      .map((stroke) => ({
        points: stroke.points.map((point) => ({
          x: point.x,
          y: point.y,
          t: point.t,
          p: point.p,
        })),
      })),
  };
}
