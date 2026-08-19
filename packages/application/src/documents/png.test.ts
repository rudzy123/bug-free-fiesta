import { describe, expect, it } from 'vitest';
import { ValidationError } from '@esign/domain';
import { createTestPng } from '@esign/test-utils';
import { PNG_MAGIC, decodePngBase64, validateSignaturePng } from './png.js';

describe('signature PNG validation', () => {
  it('accepts a well-formed PNG within size and dimension limits', () => {
    const png = createTestPng({ width: 32, height: 16 });
    const validated = validateSignaturePng(png);
    expect(validated.width).toBe(32);
    expect(validated.height).toBe(16);
    expect(validated.bytes.byteLength).toBe(png.byteLength);
  });

  it('rejects missing magic bytes', () => {
    const png = createTestPng();
    png[0] = 0x00;
    expect(() => validateSignaturePng(png)).toThrow(ValidationError);
  });

  it('rejects dimensions outside the allowed range', () => {
    expect(() => validateSignaturePng(createTestPng({ width: 4, height: 16 }))).toThrow(
      ValidationError,
    );
    expect(() => validateSignaturePng(createTestPng({ width: 32, height: 2001 }))).toThrow(
      ValidationError,
    );
  });

  it('rejects oversized bodies and invalid base64', () => {
    const png = createTestPng();
    expect(() => validateSignaturePng(png, png.byteLength - 1)).toThrow(ValidationError);
    expect(() => decodePngBase64('abc')).toThrow(ValidationError);
    const encoded = Buffer.from(png).toString('base64');
    expect(decodePngBase64(` ${encoded}\n`)).toEqual(png);
  });

  it('starts with PNG magic', () => {
    const png = createTestPng();
    for (let index = 0; index < PNG_MAGIC.byteLength; index += 1) {
      expect(png[index]).toBe(PNG_MAGIC[index]);
    }
  });
});
