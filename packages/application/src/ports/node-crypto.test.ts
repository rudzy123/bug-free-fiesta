import { describe, expect, it } from 'vitest';
import { IntegrityError } from '@esign/domain';
import { createMemoryObjectStorage } from './memory-object-storage.js';
import {
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  issueSigningToken,
} from './node-crypto.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('node crypto ports', () => {
  it('hashes signing tokens without returning the raw token from the hasher', () => {
    const issued = issueSigningToken(createSigningTokenGenerator(), createSigningTokenHasher());
    expect(issued.rawToken.length).toBeGreaterThan(20);
    expect(issued.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.tokenHash).not.toBe(issued.rawToken);
    expect(createSha256Hashing().sha256Hex(issued.rawToken)).toBe(issued.tokenHash);
  });

  it('HMAC-peppers token hashes when configured (SEC-020)', () => {
    const hashing = createSha256Hashing();
    const hasher = createSigningTokenHasher(hashing, {
      pepper: 'production-test-token-hash-pepper-ok!!',
    });
    const raw = 'opaque-token-value';
    const digest = hasher.hash(raw);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe(hashing.sha256Hex(raw));
    expect(hasher.hash(raw)).toBe(digest);
  });
});

describe('memory object storage', () => {
  it('prefixes object keys with the organization id', async () => {
    const storage = createMemoryObjectStorage();
    const stored = await storage.putObject({
      organizationId: ORG,
      key: 'revisions/source.pdf',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    });
    expect(stored.key).toBe(`org/${ORG}/revisions/source.pdf`);
    const read = await storage.getObject({ organizationId: ORG, key: stored.key });
    expect(read?.body).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('refuses to read another tenant’s key', async () => {
    const storage = createMemoryObjectStorage();
    const stored = await storage.putObject({
      organizationId: ORG,
      key: 'revisions/source.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
    });
    await expect(
      storage.getObject({ organizationId: OTHER, key: stored.key }),
    ).rejects.toBeInstanceOf(IntegrityError);
  });
});
