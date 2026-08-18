import {
  IntegrityError,
  ValidationError,
  assertTenantObjectKey,
  tenantObjectKey,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@esign/domain';
import { createSha256Hashing } from './node-crypto.js';

type StoredObject = StoredObjectMetadata & { body: Uint8Array };

export function createMemoryObjectStorage(): ObjectStorage {
  const objects = new Map<string, StoredObject>();
  const hashing = createSha256Hashing();

  return {
    async putObject(input) {
      if (input.maxBytes !== undefined && input.body.byteLength > input.maxBytes) {
        throw new ValidationError({ reason: 'payload_too_large' });
      }
      const key = tenantObjectKey(input.organizationId, input.key);
      const metadata: StoredObjectMetadata = {
        key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        sha256Digest: hashing.sha256Hex(input.body),
      };
      objects.set(key, { ...metadata, body: Uint8Array.from(input.body) });
      return metadata;
    },
    async getObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return { body: stored.body, contentType: stored.contentType };
    },
    async deleteObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      if (!key.startsWith(`org/${input.organizationId}/`)) {
        throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
      }
      objects.delete(key);
    },
  };
}
