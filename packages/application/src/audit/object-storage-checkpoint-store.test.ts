import { describe, expect, it } from 'vitest';
import { IntegrityError } from '@esign/domain';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createSha256Hashing } from '../ports/node-crypto.js';
import { createMemoryCheckpointStore } from './memory-checkpoint-store.js';
import { createObjectStorageCheckpointStore } from './object-storage-checkpoint-store.js';
import { shouldRunScheduledAuditVerification } from './scheduled-verification.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DOC = '44444444-4444-4444-8444-444444444444';

describe('immutable checkpoint store', () => {
  it('refuses to overwrite a different hash at the same sequence', async () => {
    const store = createMemoryCheckpointStore();
    const first = {
      organizationId: ORG,
      documentId: DOC,
      sequence: 1,
      eventHash: 'a'.repeat(64),
      schemaVersion: 1,
      anchoredAt: new Date('2026-08-19T12:00:00.000Z'),
    };
    expect(await store.putIfAbsent(first)).toBe('stored');
    expect(await store.putIfAbsent(first)).toBe('exists');
    await expect(store.putIfAbsent({ ...first, eventHash: 'b'.repeat(64) })).rejects.toBeInstanceOf(
      IntegrityError,
    );
  });

  it('stores canonical checkpoint objects without overwrite', async () => {
    const hashing = createSha256Hashing();
    const store = createObjectStorageCheckpointStore({
      storage: createMemoryObjectStorage(),
      hashing,
    });
    const checkpoint = {
      organizationId: ORG,
      documentId: DOC,
      sequence: 2,
      eventHash: 'c'.repeat(64),
      schemaVersion: 1,
      anchoredAt: new Date('2026-08-19T12:00:00.000Z'),
    };
    expect(await store.putIfAbsent(checkpoint)).toBe('stored');
    expect(await store.getLatest({ organizationId: ORG, documentId: DOC })).toMatchObject({
      sequence: 2,
      eventHash: 'c'.repeat(64),
    });
  });
});

describe('scheduled verification cadence', () => {
  it('runs when never run and after the interval', () => {
    const now = new Date('2026-08-19T12:00:00.000Z');
    expect(shouldRunScheduledAuditVerification({ lastRunAt: null, now, intervalMs: 60_000 })).toBe(
      true,
    );
    expect(
      shouldRunScheduledAuditVerification({
        lastRunAt: new Date('2026-08-19T11:59:30.000Z'),
        now,
        intervalMs: 60_000,
      }),
    ).toBe(false);
    expect(
      shouldRunScheduledAuditVerification({
        lastRunAt: new Date('2026-08-19T11:58:00.000Z'),
        now,
        intervalMs: 60_000,
      }),
    ).toBe(true);
  });
});
