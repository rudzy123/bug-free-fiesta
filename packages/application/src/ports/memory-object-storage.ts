import {
  IntegrityError,
  ValidationError,
  assertTenantObjectKey,
  tenantObjectKey,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@esign/domain';
import { createSha256Hashing } from './node-crypto.js';

type StoredObject = StoredObjectMetadata & { body: Uint8Array; storedAt: Date };

export function createMemoryObjectStorage(options?: { clock?: () => Date }): ObjectStorage {
  const objects = new Map<string, StoredObject>();
  const hashing = createSha256Hashing();
  const now = options?.clock ?? (() => new Date());

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
      const existing = objects.get(key);
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
        objects.set(key, { ...metadata, body: Uint8Array.from(input.body), storedAt: now() });
      }
      return metadata;
    },
    async getObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return {
        body: stored.body,
        contentType: stored.contentType,
        sha256Digest: stored.sha256Digest,
        sizeBytes: stored.sizeBytes,
      };
    },
    async deleteObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      if (!key.startsWith(`org/${input.organizationId}/`)) {
        throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
      }
      objects.delete(key);
    },
    async listKeys(input) {
      const prefix = tenantObjectKey(input.organizationId, input.prefix);
      const keys: string[] = [];
      for (const [key, stored] of objects) {
        if (key.startsWith(prefix) && stored.storedAt.getTime() <= input.olderThan.getTime()) {
          keys.push(key);
        }
      }
      return keys;
    },
  };
}
