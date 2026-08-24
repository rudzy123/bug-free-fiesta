import { IntegrityError, type AuditCheckpoint, type ImmutableCheckpointStore } from '@esign/domain';

function checkpointKey(input: {
  organizationId: string;
  documentId: string;
  sequence: number;
}): string {
  return `${input.organizationId}:${input.documentId}:${input.sequence}`;
}

export function createMemoryCheckpointStore(
  seed: readonly AuditCheckpoint[] = [],
): ImmutableCheckpointStore & { records: AuditCheckpoint[] } {
  const records = [...seed];
  return {
    enabled: true,
    records,
    async putIfAbsent(checkpoint) {
      const existing = records.find(
        (row) =>
          row.organizationId === checkpoint.organizationId &&
          row.documentId === checkpoint.documentId &&
          row.sequence === checkpoint.sequence,
      );
      if (existing) {
        if (existing.eventHash !== checkpoint.eventHash) {
          throw new IntegrityError({
            reason: 'checkpoint_immutable_conflict',
            key: checkpointKey(checkpoint),
          });
        }
        return 'exists';
      }
      records.push(checkpoint);
      return 'stored';
    },
    async get(input) {
      return (
        records.find(
          (row) =>
            row.organizationId === input.organizationId &&
            row.documentId === input.documentId &&
            row.sequence === input.sequence,
        ) ?? null
      );
    },
    async getLatest(input) {
      const matching = records.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
      if (matching.length === 0) {
        return null;
      }
      return matching.reduce((head, row) => (row.sequence > head.sequence ? row : head));
    },
  };
}

export function createDisabledCheckpointStore(): ImmutableCheckpointStore {
  return {
    enabled: false,
    async putIfAbsent() {
      return 'disabled';
    },
    async get() {
      return null;
    },
    async getLatest() {
      return null;
    },
  };
}
