import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  IntegrityError,
  ValidationError,
  assertTenantObjectKey,
  tenantObjectKey,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@esign/domain';
import { createSha256Hashing } from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';

type ObjectSidecar = {
  readonly contentType: string;
  readonly sha256Digest: string;
  readonly sizeBytes: number;
  readonly storedAt: string;
};

/**
 * Filesystem-backed object storage that shares a single directory across the
 * API and worker processes. It is a local/dev and end-to-end test driver only
 * (production uses an S3/Azure-compatible port); it is opt-in and never the
 * default. Semantics mirror the in-memory adapter: content-addressed
 * immutability, digest verification, and tenant-scoped keys.
 */
/**
 * Selects the object-storage backend from configuration. `memory` (default) is
 * per-process; `filesystem` shares a directory across processes for local/dev
 * and end-to-end testing.
 */
export function createObjectStorageDriver(input: {
  driver: 'memory' | 'filesystem';
  fsRoot?: string | undefined;
}): ObjectStorage {
  if (input.driver === 'filesystem') {
    if (input.fsRoot === undefined || input.fsRoot.trim() === '') {
      throw new Error(
        'Filesystem object storage requires a root directory (set OBJECT_STORAGE_FS_ROOT).',
      );
    }
    return createFilesystemObjectStorage({ rootDir: input.fsRoot });
  }
  return createMemoryObjectStorage();
}

function resolveUnderRoot(rootDir: string, key: string): string {
  const absoluteRoot = resolve(rootDir);
  const candidate = resolve(absoluteRoot, ...key.split('/'));
  if (candidate !== absoluteRoot && !candidate.startsWith(`${absoluteRoot}${sep}`)) {
    throw new IntegrityError({ reason: 'object_key_escapes_root' });
  }
  return candidate;
}

export function createFilesystemObjectStorage(options: { rootDir: string }): ObjectStorage {
  const root = options.rootDir;
  const hashing = createSha256Hashing();

  const bodyPath = (key: string): string => resolveUnderRoot(root, key);
  const metaPath = (key: string): string => `${bodyPath(key)}.meta.json`;

  const writeAtomic = async (target: string, data: Uint8Array | string): Promise<void> => {
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, target);
  };

  const readSidecar = async (key: string): Promise<ObjectSidecar | null> => {
    try {
      return JSON.parse(await readFile(metaPath(key), 'utf8')) as ObjectSidecar;
    } catch {
      return null;
    }
  };

  return {
    async putObject(input) {
      if (input.maxBytes !== undefined && input.body.byteLength > input.maxBytes) {
        throw new ValidationError({ reason: 'payload_too_large' });
      }
      const key = tenantObjectKey(input.organizationId, input.key);
      const sha256Digest = hashing.sha256Hex(input.body);
      if (input.expectedSha256Digest !== undefined && input.expectedSha256Digest !== sha256Digest) {
        throw new IntegrityError({
          reason: 'object_digest_mismatch',
          code: 'FINAL_OBJECT_INTEGRITY_FAILURE',
        });
      }
      const existing = await readSidecar(key);
      if (existing && existing.sha256Digest !== sha256Digest) {
        throw new IntegrityError({ reason: 'immutable_key_conflict' });
      }
      const metadata: StoredObjectMetadata = {
        key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        sha256Digest,
      };
      if (!existing) {
        await writeAtomic(bodyPath(key), Uint8Array.from(input.body));
        const sidecar: ObjectSidecar = {
          contentType: input.contentType,
          sha256Digest,
          sizeBytes: input.body.byteLength,
          storedAt: new Date().toISOString(),
        };
        await writeAtomic(metaPath(key), JSON.stringify(sidecar));
      }
      return metadata;
    },

    async getObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      const sidecar = await readSidecar(key);
      if (sidecar === null || !existsSync(bodyPath(key))) {
        return null;
      }
      const body = await readFile(bodyPath(key));
      return {
        body: new Uint8Array(body),
        contentType: sidecar.contentType,
        sha256Digest: sidecar.sha256Digest,
        sizeBytes: sidecar.sizeBytes,
      };
    },

    async deleteObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      if (!key.startsWith(`org/${input.organizationId}/`)) {
        throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
      }
      await rm(bodyPath(key), { force: true });
      await rm(metaPath(key), { force: true });
    },

    async listKeys(input) {
      const prefix = tenantObjectKey(input.organizationId, input.prefix);
      const prefixDir = resolveUnderRoot(root, prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
      const searchDir = existsSync(prefixDir) ? prefixDir : dirname(prefixDir);
      const keys: string[] = [];
      await collectKeys(searchDir, root, async (key) => {
        if (!key.startsWith(prefix)) {
          return;
        }
        const sidecar = await readSidecar(key);
        if (sidecar !== null && new Date(sidecar.storedAt).getTime() <= input.olderThan.getTime()) {
          keys.push(key);
        }
      });
      return keys;
    },
  };
}

async function collectKeys(
  dir: string,
  root: string,
  visit: (key: string) => Promise<void>,
): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const info = await stat(full).catch(() => null);
    if (info === null) {
      continue;
    }
    if (info.isDirectory()) {
      await collectKeys(full, root, visit);
      continue;
    }
    if (entry.endsWith('.meta.json') || entry.endsWith('.tmp')) {
      continue;
    }
    const key = full
      .slice(root.length + 1)
      .split(sep)
      .join('/');
    await visit(key);
  }
}
