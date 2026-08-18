import { ValidationError, type ObjectStorage } from '@esign/domain';

/**
 * Enforces the configured maximum object size before delegating to storage.
 * Production buckets/containers must also set a matching max-object-size policy.
 */
export function createSizeLimitedObjectStorage(
  inner: ObjectStorage,
  maxBytes: number,
): ObjectStorage {
  return {
    async putObject(input) {
      if (input.body.byteLength > maxBytes) {
        throw new ValidationError({ reason: 'payload_too_large' });
      }
      return inner.putObject({ ...input, maxBytes });
    },
    getObject: (input) => inner.getObject(input),
    deleteObject: (input) => inner.deleteObject(input),
  };
}
