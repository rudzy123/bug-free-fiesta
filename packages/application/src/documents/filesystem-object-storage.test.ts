import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrityError, ValidationError } from '@esign/domain';
import {
  createFilesystemObjectStorage,
  createObjectStorageDriver,
} from './filesystem-object-storage.js';

const ORG = '11111111-1111-4111-8111-111111111111';
// Callers pass fully tenant-prefixed keys (org/<orgId>/...), as produced by
// sourceRevisionObjectKey/artifactObjectKey/signatureImageObjectKey.
const PREFIX = `org/${ORG}/`;

describe('filesystem object storage', () => {
  let root: string;
  let storage: ReturnType<typeof createFilesystemObjectStorage>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'esign-fs-store-'));
    storage = createFilesystemObjectStorage({ rootDir: root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and reads an object with metadata', async () => {
    const body = new TextEncoder().encode('%PDF-1.4 hello');
    const meta = await storage.putObject({
      organizationId: ORG,
      key: `${PREFIX}revisions/abc`,
      body,
      contentType: 'application/pdf',
    });
    expect(meta.sizeBytes).toBe(body.byteLength);
    const read = await storage.getObject({ organizationId: ORG, key: `${PREFIX}revisions/abc` });
    expect(read).not.toBeNull();
    expect(read?.contentType).toBe('application/pdf');
    expect(read?.sha256Digest).toBe(meta.sha256Digest);
    expect(new TextDecoder().decode(read?.body)).toBe('%PDF-1.4 hello');
  });

  it('returns null for a missing object', async () => {
    expect(await storage.getObject({ organizationId: ORG, key: `${PREFIX}nope` })).toBeNull();
  });

  it('is content-addressed immutable: same key with different bytes conflicts', async () => {
    await storage.putObject({
      organizationId: ORG,
      key: `${PREFIX}k`,
      body: new TextEncoder().encode('one'),
      contentType: 'application/pdf',
    });
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: `${PREFIX}k`,
        body: new TextEncoder().encode('two'),
        contentType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it('rejects an expected-digest mismatch', async () => {
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: `${PREFIX}k`,
        body: new TextEncoder().encode('data'),
        contentType: 'application/pdf',
        expectedSha256Digest: 'deadbeef',
      }),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it('enforces maxBytes', async () => {
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: `${PREFIX}k`,
        body: new Uint8Array(10),
        contentType: 'application/pdf',
        maxBytes: 4,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('deletes objects and lists keys by prefix and age', async () => {
    await storage.putObject({
      organizationId: ORG,
      key: `${PREFIX}revisions/one`,
      body: new TextEncoder().encode('a'),
      contentType: 'application/pdf',
    });
    const future = new Date(Date.now() + 60_000);
    expect(
      await storage.listKeys({
        organizationId: ORG,
        prefix: `${PREFIX}revisions/`,
        olderThan: future,
      }),
    ).toHaveLength(1);
    await storage.deleteObject({ organizationId: ORG, key: `${PREFIX}revisions/one` });
    expect(
      await storage.getObject({ organizationId: ORG, key: `${PREFIX}revisions/one` }),
    ).toBeNull();
  });

  it('shares data across two adapters pointed at the same directory (cross-process)', async () => {
    await storage.putObject({
      organizationId: ORG,
      key: `${PREFIX}shared`,
      body: new TextEncoder().encode('shared-bytes'),
      contentType: 'application/pdf',
    });
    const other = createFilesystemObjectStorage({ rootDir: root });
    const read = await other.getObject({ organizationId: ORG, key: `${PREFIX}shared` });
    expect(new TextDecoder().decode(read?.body)).toBe('shared-bytes');
  });
});

describe('createObjectStorageDriver', () => {
  it('defaults to an in-memory driver', () => {
    const memory = createObjectStorageDriver({ driver: 'memory' });
    expect(memory).toBeDefined();
  });

  it('requires a root directory for the filesystem driver', () => {
    expect(() => createObjectStorageDriver({ driver: 'filesystem' })).toThrow(/root directory/i);
  });
});
