import { describe, expect, it } from 'vitest';
import { readSigningCsrfToken } from './csrf';

describe('signing csrf cookie', () => {
  it('reads the signer CSRF cookie without logging the session cookie', () => {
    const header = 'esign_sign=secret-session; esign_sign_csrf=visible-csrf';
    expect(readSigningCsrfToken(header)).toBe('visible-csrf');
  });
});
