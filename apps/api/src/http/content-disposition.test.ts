import { describe, expect, it } from 'vitest';
import { contentDispositionHeader } from './content-disposition.js';

describe('contentDispositionHeader (SEC-013)', () => {
  it('strips CR/LF and quotes dangerous characters', () => {
    const value = contentDispositionHeader('attachment', 'evil\r\nName".pdf');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toContain('filename="evilName_.pdf"');
    expect(value).toContain("filename*=UTF-8''");
  });

  it('preserves unicode via filename*', () => {
    const value = contentDispositionHeader('inline', 'contrat-été.pdf');
    expect(value.startsWith('inline;')).toBe(true);
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain('%');
  });
});
