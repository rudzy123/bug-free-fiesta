import { describe, expect, it } from 'vitest';
import { AuthenticationError } from '@esign/domain';
import { extractExchangeToken } from './require-signer-session.js';

describe('extractExchangeToken (SEC-004)', () => {
  it('accepts a body token', () => {
    expect(
      extractExchangeToken({
        bodyToken: 'body-token-value',
        authorization: undefined,
      }),
    ).toBe('body-token-value');
  });

  it('accepts a Bearer authorization token', () => {
    expect(
      extractExchangeToken({
        bodyToken: undefined,
        authorization: 'Bearer bearer-token-value',
      }),
    ).toBe('bearer-token-value');
  });

  it('rejects query-string tokens (no durable URL tokens)', () => {
    expect(() =>
      extractExchangeToken({
        bodyToken: undefined,
        authorization: undefined,
      }),
    ).toThrow(AuthenticationError);
  });

  it('does not accept empty body or Bearer values', () => {
    expect(() =>
      extractExchangeToken({
        bodyToken: '   ',
        authorization: 'Bearer ',
      }),
    ).toThrow(AuthenticationError);
  });
});
