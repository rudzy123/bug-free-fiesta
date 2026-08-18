import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@esign/domain';
import { createSha256Hashing } from '../ports/node-crypto.js';
import { assertCsrfToken, originIsAllowed } from './csrf.js';

describe('CSRF helpers', () => {
  const hashing = createSha256Hashing();
  const token = 'csrf-test-token';

  it('rejects missing or mismatched CSRF tokens', () => {
    expect(() =>
      assertCsrfToken({
        headerToken: undefined,
        cookieToken: token,
        expectedHash: hashing.sha256Hex(token),
        hash: (value) => hashing.sha256Hex(value),
      }),
    ).toThrow(AuthorizationError);
    expect(() =>
      assertCsrfToken({
        headerToken: token,
        cookieToken: 'other',
        expectedHash: hashing.sha256Hex(token),
        hash: (value) => hashing.sha256Hex(value),
      }),
    ).toThrow(AuthorizationError);
  });

  it('accepts a matching double-submit token that hashes to the session value', () => {
    expect(() =>
      assertCsrfToken({
        headerToken: token,
        cookieToken: token,
        expectedHash: hashing.sha256Hex(token),
        hash: (value) => hashing.sha256Hex(value),
      }),
    ).not.toThrow();
  });

  it('allows only configured origins', () => {
    expect(originIsAllowed('http://localhost:3000', undefined, ['http://localhost:3000'])).toBe(
      true,
    );
    expect(originIsAllowed(undefined, 'http://localhost:3000/app', ['http://localhost:3000'])).toBe(
      true,
    );
    expect(originIsAllowed('https://evil.example', undefined, ['http://localhost:3000'])).toBe(
      false,
    );
    expect(originIsAllowed(undefined, undefined, ['http://localhost:3000'])).toBe(false);
  });
});
