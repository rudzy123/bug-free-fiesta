export type AuditCheckpoint = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly sequence: number;
  readonly eventHash: string;
  readonly schemaVersion: number;
  readonly anchoredAt: Date;
};

export type CheckpointPutResult = 'stored' | 'exists' | 'disabled';

/**
 * Boundary for writing audit head hashes to storage that is independent of the
 * application database. Implementations must not overwrite a different hash for
 * the same (organization, document, sequence). A memory adapter is for tests;
 * production should use WORM/object-lock or an external ledger. This port does
 * not by itself prevent a privileged administrator from rewriting both stores.
 */
export type ImmutableCheckpointStore = {
  readonly enabled: boolean;
  putIfAbsent: (checkpoint: AuditCheckpoint) => Promise<CheckpointPutResult>;
  get: (input: {
    organizationId: string;
    documentId: string;
    sequence: number;
  }) => Promise<AuditCheckpoint | null>;
  getLatest: (input: {
    organizationId: string;
    documentId: string;
  }) => Promise<AuditCheckpoint | null>;
};
