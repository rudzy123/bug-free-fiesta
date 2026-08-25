import { describe, expect, it } from 'vitest';
import { IntegrityError } from './errors.js';
import { assertTenantObjectKey, sourceRevisionObjectKey, tenantObjectKey } from './object-keys.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DIGEST = 'a'.repeat(64);

describe('object key path safety (SEC-005)', () => {
  it('rejects relative segments that escape the tenant prefix', () => {
    expect(() => tenantObjectKey(ORG, 'revisions/../../etc/passwd')).toThrow(IntegrityError);
    expect(() => assertTenantObjectKey(ORG, `org/${ORG}/revisions/../../outside`)).toThrow(
      IntegrityError,
    );
    expect(() => tenantObjectKey(ORG, 'revisions/./secret')).toThrow(IntegrityError);
    expect(() => tenantObjectKey(ORG, 'revisions//double')).toThrow(IntegrityError);
    expect(() => tenantObjectKey(ORG, 'revisions\\win')).toThrow(IntegrityError);
  });

  it('accepts content-addressed revision keys', () => {
    const key = sourceRevisionObjectKey(ORG, DIGEST);
    expect(key).toBe(`org/${ORG}/revisions/${DIGEST}`);
    expect(assertTenantObjectKey(ORG, key)).toBe(key);
  });
});
