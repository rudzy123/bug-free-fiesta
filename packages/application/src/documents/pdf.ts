import { ValidationError } from '@esign/domain';

export const PDF_CONTENT_TYPE = 'application/pdf';
export const PDF_EXTENSION = '.pdf';
export const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

const DISPLAY_NAME_MAX = 180;
const RESERVED_FILENAME_CHARS = new Set(['<', '>', ':', '"', '|', '?', '*']);

function replaceUnsafeFilenameChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isControl = code <= 31 || code === 127;
    const isBidiOverride = code >= 0x202a && code <= 0x202e;
    result += isControl || isBidiOverride || RESERVED_FILENAME_CHARS.has(char) ? '_' : char;
  }
  return result;
}

export function assertedPdfContentType(value: string | undefined): string {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (normalized !== PDF_CONTENT_TYPE) {
    throw new ValidationError({ reason: 'content_type', expected: PDF_CONTENT_TYPE });
  }
  return PDF_CONTENT_TYPE;
}

/**
 * Client filenames are untrusted. Path components are dropped, control characters
 * replaced, and a `.pdf` extension is required. The result is display metadata only.
 */
export function sanitizeDisplayFilename(raw: string): string {
  const withoutNulls = raw.replaceAll('\0', '');
  const segments = withoutNulls.split(/[/\\]/);
  const base = segments[segments.length - 1] ?? '';
  const cleaned = replaceUnsafeFilenameChars(base).trim();
  const truncated = cleaned.slice(0, DISPLAY_NAME_MAX);
  if (!/\.pdf$/i.test(truncated)) {
    throw new ValidationError({ reason: 'filename_extension', expected: PDF_EXTENSION });
  }
  const withExtension = truncated.replace(/\.pdf$/i, PDF_EXTENSION);
  if (withExtension === PDF_EXTENSION) {
    return 'document.pdf';
  }
  return withExtension;
}

export function assertPdfMagicBytes(body: Uint8Array): void {
  if (body.byteLength < PDF_MAGIC.byteLength) {
    throw new ValidationError({ reason: 'pdf_magic' });
  }
  for (let index = 0; index < PDF_MAGIC.byteLength; index += 1) {
    if (body[index] !== PDF_MAGIC[index]) {
      throw new ValidationError({ reason: 'pdf_magic' });
    }
  }
}

export function assertUploadSize(body: Uint8Array, maxBytes: number): void {
  if (body.byteLength === 0) {
    throw new ValidationError({ reason: 'empty_body' });
  }
  if (body.byteLength > maxBytes) {
    throw new ValidationError({ reason: 'payload_too_large' });
  }
}
