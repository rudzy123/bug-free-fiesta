import {
  IntegrityError,
  serializeCanonicalJson,
  tenantObjectKey,
  type AuditCheckpoint,
  type Hashing,
  type ImmutableCheckpointStore,
  type ObjectStorage,
} from '@esign/domain';

const CHECKPOINT_CONTENT_TYPE = 'application/json';

export function auditCheckpointObjectKey(organizationId: string, documentId: string, sequence: number): string {
  return tenantObjectKey(
    organizationId,
    `audit-checkpoints/${documentId}/${String(sequence)}.json`,
  );
}

function checkpointBytes(checkpoint: AuditCheckpoint, hashing: Hashing): {
  body: Uint8Array;
  digest: string;
} {
  const canonical = serializeCanonicalJson({
    anchoredAt: checkpoint.anchoredAt.toISOString(),
    documentId: checkpoint.documentId,
    eventHash: checkpoint.eventHash,
    organizationId: checkpoint.organizationId,
    schemaVersion: checkpoint.schemaVersion,
    sequence: checkpoint.sequence,
  });
  const body = new TextEncoder().encode(canonical);
  return { body, digest: hashing.sha256Hex(body) };
}

function parseCheckpoint(body: Uint8Array): AuditCheckpoint | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    if (
      typeof parsed.organizationId !== 'string' ||
      typeof parsed.documentId !== 'string' ||
      typeof parsed.eventHash !== 'string' ||
      typeof parsed.anchoredAt !== 'string' ||
      typeof parsed.sequence !== 'number' ||
      typeof parsed.schemaVersion !== 'number'
    ) {
      return null;
    }
    const anchoredAt = new Date(parsed.anchoredAt);
    if (Number.isNaN(anchoredAt.getTime())) {
      return null;
    }
    return {
      organizationId: parsed.organizationId,
      documentId: parsed.documentId,
      sequence: parsed.sequence,
      eventHash: parsed.eventHash,
      schemaVersion: parsed.schemaVersion,
      anchoredAt,
    };
  } catch {
    return null;
  }
}

/**
 * Stores checkpoint hashes via the object-storage port. Keys are immutable;
 * a different digest at the same key is a conflict. This is not WORM by itself:
 * operators must enable object-lock/legal hold on the bucket for durability
 * against a storage administrator. The database chain can still be rewritten
 * if this store is empty or also replaced.
 */
export function createObjectStorageCheckpointStore(deps: {
  storage: ObjectStorage;
  hashing: Hashing;
}): ImmutableCheckpointStore {
  return {
    enabled: true,
    async putIfAbsent(checkpoint) {
      const key = auditCheckpointObjectKey(
        checkpoint.organizationId,
        checkpoint.documentId,
        checkpoint.sequence,
      );
      const existing = await deps.storage.getObject({
        organizationId: checkpoint.organizationId,
        key,
      });
      const { body, digest } = checkpointBytes(checkpoint, deps.hashing);
      if (existing) {
        if (existing.sha256Digest !== digest) {
          throw new IntegrityError({ reason: 'checkpoint_immutable_conflict', key });
        }
        return 'exists';
      }
      await deps.storage.putObject({
        organizationId: checkpoint.organizationId,
        key,
        body,
        contentType: CHECKPOINT_CONTENT_TYPE,
        expectedSha256Digest: digest,
      });
      return 'stored';
    },
    async get(input) {
      const key = auditCheckpointObjectKey(input.organizationId, input.documentId, input.sequence);
      const stored = await deps.storage.getObject({
        organizationId: input.organizationId,
        key,
      });
      return stored ? parseCheckpoint(stored.body) : null;
    },
    async getLatest(input) {
      const keys = await deps.storage.listKeys({
        organizationId: input.organizationId,
        prefix: `audit-checkpoints/${input.documentId}/`,
        olderThan: new Date(8.64e15),
      });
      let latest: AuditCheckpoint | null = null;
      for (const key of keys) {
        const stored = await deps.storage.getObject({
          organizationId: input.organizationId,
          key,
        });
        const parsed = stored ? parseCheckpoint(stored.body) : null;
        if (parsed && (latest === null || parsed.sequence > latest.sequence)) {
          latest = parsed;
        }
      }
      return latest;
    },
  };
}
