import type { ObjectStorage } from '@esign/domain';
import { createS3ObjectStorage, type S3ObjectStorageOptions } from './s3-object-storage.js';

export type DevObjectStorageDriver = 'memory' | 'filesystem';

export type ResolveObjectStorageInput = {
  readonly driver: DevObjectStorageDriver | 's3';
  readonly fsRoot?: string | undefined;
  readonly s3: S3ObjectStorageOptions;
  readonly createDevDriver: (input: {
    driver: DevObjectStorageDriver;
    fsRoot?: string | undefined;
  }) => ObjectStorage;
};

/**
 * Composition-root helper: production uses `s3`; local/e2e may use memory or filesystem.
 */
export function resolveObjectStorage(input: ResolveObjectStorageInput): ObjectStorage {
  if (input.driver === 's3') {
    return createS3ObjectStorage(input.s3);
  }
  return input.createDevDriver({
    driver: input.driver,
    fsRoot: input.fsRoot,
  });
}
