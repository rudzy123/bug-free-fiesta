import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from '@esign/domain';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { withObjectStorageErrorMetrics } from './instrumented-object-storage.js';

const ORG = '01900000-0000-7000-8000-000000000001';

describe('withObjectStorageErrorMetrics', () => {
  it('does not record on successful operations', async () => {
    const recordError = vi.fn();
    const storage = withObjectStorageErrorMetrics(createMemoryObjectStorage(), { recordError });
    await storage.putObject({
      organizationId: ORG,
      key: `${ORG}/revisions/a`,
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    });
    expect(recordError).not.toHaveBeenCalled();
  });

  it('records put/get failures and rethrows', async () => {
    const recordError = vi.fn();
    const failing: ObjectStorage = {
      putObject: async () => {
        throw new Error('disk full');
      },
      getObject: async () => {
        throw new Error('io');
      },
      deleteObject: async () => undefined,
      listKeys: async () => [],
    };
    const storage = withObjectStorageErrorMetrics(failing, { recordError });
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: `${ORG}/x`,
        body: new Uint8Array([1]),
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow('disk full');
    await expect(storage.getObject({ organizationId: ORG, key: `${ORG}/x` })).rejects.toThrow('io');
    expect(recordError).toHaveBeenCalledWith({ operation: 'put' });
    expect(recordError).toHaveBeenCalledWith({ operation: 'get' });
  });
});
