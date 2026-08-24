import type { Hashing, ImmutableCheckpointStore, ObjectStorage } from '@esign/domain';
import { createDisabledCheckpointStore } from './memory-checkpoint-store.js';
import { createObjectStorageCheckpointStore } from './object-storage-checkpoint-store.js';

export type AuditCheckpointStoreName = 'disabled' | 'object_storage';

export function createConfiguredCheckpointStore(input: {
  name: AuditCheckpointStoreName;
  storage: ObjectStorage;
  hashing: Hashing;
}): ImmutableCheckpointStore {
  if (input.name === 'object_storage') {
    return createObjectStorageCheckpointStore({
      storage: input.storage,
      hashing: input.hashing,
    });
  }
  return createDisabledCheckpointStore();
}
