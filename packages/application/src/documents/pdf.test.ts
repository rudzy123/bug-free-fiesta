import { describe, expect, it } from 'vitest';
import { ValidationError } from '@esign/domain';
import {
  PDF_CONTENT_TYPE,
  assertPdfMagicBytes,
  assertUploadSize,
  assertedPdfContentType,
  sanitizeDisplayFilename,
} from './pdf.js';

describe('PDF upload validation', () => {
  it('sanitizes path-like filenames and requires a pdf extension', () => {
    expect(sanitizeDisplayFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeDisplayFilename('Contract.PDF')).toBe('Contract.pdf');
    expect(() => sanitizeDisplayFilename('payload.exe')).toThrow(ValidationError);
  });

  it('accepts only application/pdf content types', () => {
    expect(assertedPdfContentType('application/pdf')).toBe(PDF_CONTENT_TYPE);
    expect(assertedPdfContentType('application/pdf; charset=binary')).toBe(PDF_CONTENT_TYPE);
    expect(() => assertedPdfContentType('application/octet-stream')).toThrow(ValidationError);
  });

  it('rejects bodies that do not start with PDF magic bytes', () => {
    expect(() => assertPdfMagicBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]))).toThrow(
      ValidationError,
    );
    expect(() => assertPdfMagicBytes(new TextEncoder().encode('%PDF-1.4\n'))).not.toThrow();
  });

  it('enforces a maximum upload size', () => {
    expect(() => assertUploadSize(new Uint8Array([1, 2, 3]), 2)).toThrow(ValidationError);
    expect(() => assertUploadSize(new Uint8Array([1, 2, 3]), 3)).not.toThrow();
  });
});
