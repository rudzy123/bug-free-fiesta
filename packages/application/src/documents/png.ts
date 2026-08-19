import { finalizationError } from '@esign/domain';

export const PNG_CONTENT_TYPE = 'image/png';
export const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PNG_MAX_BYTES = 256_000;
export const PNG_MIN_DIMENSION = 8;
export const PNG_MAX_DIMENSION = 2_000;

export type ValidatedPng = {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
};

export function decodePngBase64(value: string): Uint8Array {
  let normalized = '';
  for (const char of value) {
    if (char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t') {
      normalized += char;
    }
  }
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_base64' });
  }
  try {
    return Uint8Array.from(Buffer.from(normalized, 'base64'));
  } catch {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_base64' });
  }
}

export function assertPngMagicBytes(body: Uint8Array): void {
  if (body.byteLength < PNG_MAGIC.byteLength) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_magic' });
  }
  for (let index = 0; index < PNG_MAGIC.byteLength; index += 1) {
    if (body[index] !== PNG_MAGIC[index]) {
      throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_magic' });
    }
  }
}

export function readPngDimensions(body: Uint8Array): { width: number; height: number } {
  if (body.byteLength < 24) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_ihdr' });
  }
  const ihdr =
    String.fromCharCode(body[12] ?? 0) +
    String.fromCharCode(body[13] ?? 0) +
    String.fromCharCode(body[14] ?? 0) +
    String.fromCharCode(body[15] ?? 0);
  if (ihdr !== 'IHDR') {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_ihdr' });
  }
  const width = readUint32(body, 16);
  const height = readUint32(body, 20);
  return { width, height };
}

export function validateSignaturePng(
  body: Uint8Array,
  maxBytes: number = PNG_MAX_BYTES,
): ValidatedPng {
  if (body.byteLength === 0 || body.byteLength > maxBytes) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', {
      reason: 'png_size',
      size: body.byteLength,
    });
  }
  assertPngMagicBytes(body);
  const { width, height } = readPngDimensions(body);
  if (
    width < PNG_MIN_DIMENSION ||
    height < PNG_MIN_DIMENSION ||
    width > PNG_MAX_DIMENSION ||
    height > PNG_MAX_DIMENSION
  ) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', {
      reason: 'png_dimensions',
      width,
      height,
    });
  }
  return { bytes: body, width, height };
}

function readUint32(body: Uint8Array, offset: number): number {
  const b0 = body[offset];
  const b1 = body[offset + 1];
  const b2 = body[offset + 2];
  const b3 = body[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_ihdr' });
  }
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}
