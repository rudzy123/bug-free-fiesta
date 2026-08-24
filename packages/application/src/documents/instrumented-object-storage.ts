import type { ObjectStorage } from '@esign/domain';

export type ObjectStorageErrorSink = {
  readonly recordError: (input: { operation: string }) => void;
};

/**
 * Records object-storage operation failures without changing success paths.
 * Wrap the driver (before size limits) so application validation is not counted
 * as a storage error.
 */
export function withObjectStorageErrorMetrics(
  inner: ObjectStorage,
  sink: ObjectStorageErrorSink,
): ObjectStorage {
  return {
    async putObject(input) {
      try {
        return await inner.putObject(input);
      } catch (error: unknown) {
        sink.recordError({ operation: 'put' });
        throw error;
      }
    },
    async getObject(input) {
      try {
        return await inner.getObject(input);
      } catch (error: unknown) {
        sink.recordError({ operation: 'get' });
        throw error;
      }
    },
    async deleteObject(input) {
      try {
        return await inner.deleteObject(input);
      } catch (error: unknown) {
        sink.recordError({ operation: 'delete' });
        throw error;
      }
    },
    async listKeys(input) {
      try {
        return await inner.listKeys(input);
      } catch (error: unknown) {
        sink.recordError({ operation: 'list' });
        throw error;
      }
    },
  };
}
