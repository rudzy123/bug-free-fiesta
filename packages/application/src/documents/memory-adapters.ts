import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  ConflictError,
  NotFoundError,
  assertApprovedAuditPayload,
  computeAuditEventHash,
  type AuditEvent,
  type AuditLogRepository,
  type AuditWriter,
  type BackgroundJob,
  type ConsentRecord,
  type ConsentRecordRepository,
  type Document,
  type DocumentRepository,
  type DocumentRevision,
  type DocumentRevisionRepository,
  type FinalizedArtifact,
  type FinalizedArtifactRepository,
  type IdempotencyRecord,
  type IdempotencyRecordRepository,
  type JobPublishInput,
  type JobPublisher,
  type OutboxEvent,
  type PreviewGrant,
  type PreviewGrantLookup,
  type PreviewGrantRepository,
  type SignatureField,
  type SignatureFieldRepository,
  type Signer,
  type SignerRepository,
  type SigningSession,
  type SigningSessionRepository,
  type SigningTokenLookup,
  type TransactionScope,
  type UnitOfWork,
  type UploadSession,
  type UploadSessionLookup,
  type UploadSessionRepository,
  DEFAULT_JOB_MAX_ATTEMPTS,
  assertSafeJobPayload,
} from '@esign/domain';

export type MemoryDocumentRepository = DocumentRepository & {
  records: Document[];
};

export function createMemoryDocumentRepository(
  documents: Document[] = [],
): MemoryDocumentRepository {
  const records = [...documents];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.documentId,
        ) ?? null
      );
    },
    async listByOrganization(input) {
      return records.filter((row) => row.organizationId === input.organizationId);
    },
    async create(input) {
      records.push(input.document);
      return input.document;
    },
    async attachSourceRevision(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.documentId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'document' });
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictError({ reason: 'document_version' });
      }
      const updated: Document = {
        ...current,
        currentRevisionId: input.revisionId,
        sourceDisplayName: input.sourceDisplayName,
        version: current.version + 1,
        updatedAt: current.updatedAt,
      };
      records[index] = updated;
      return updated;
    },
    async setInspectionStatus(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.documentId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'document' });
      }
      if (current.version !== input.expectedVersion) {
        throw new ConflictError({ reason: 'document_version' });
      }
      const updated: Document = {
        ...current,
        inspectionStatus: input.inspectionStatus,
        version: current.version + 1,
      };
      records[index] = updated;
      return updated;
    },
    async setSigningMode(input) {
      return bumpDocument(records, input, (current) => ({
        ...current,
        signingMode: input.signingMode,
      }));
    },
    async setPreparationState(input) {
      return bumpDocument(records, input, (current) => ({
        ...current,
        state: input.state,
      }));
    },
    async markSent(input) {
      return bumpDocument(records, input, (current) => ({
        ...current,
        state: 'sent',
        signingRevisionId: input.signingRevisionId,
        expiresAt: input.expiresAt,
      }));
    },
    async markDeclined(input) {
      return bumpDocument(records, input, (current) => {
        if (current.state !== 'sent' && current.state !== 'in_progress') {
          throw new ConflictError({ reason: 'document_not_declinable' });
        }
        return { ...current, state: 'declined' };
      });
    },
    async markInProgress(input) {
      return bumpDocument(records, input, (current) => {
        if (current.state !== 'sent' && current.state !== 'in_progress') {
          throw new ConflictError({ reason: 'document_not_in_progress' });
        }
        return { ...current, state: 'in_progress' };
      });
    },
    async markCompleted(input) {
      return bumpDocument(records, input, (current) => {
        if (current.state !== 'sent' && current.state !== 'in_progress') {
          throw new ConflictError({ reason: 'document_not_completable' });
        }
        return { ...current, state: 'completed' };
      });
    },
    async claimProcessingLease(input) {
      return bumpDocument(records, input, (current) => {
        if (
          current.leaseUntil !== null &&
          current.leaseUntil.getTime() >= input.now.getTime() &&
          current.leaseOwner !== input.owner
        ) {
          throw new ConflictError({ reason: 'document_lease', code: 'CONCURRENT_FINALIZATION' });
        }
        if (
          current.state !== 'sent' &&
          current.state !== 'in_progress' &&
          current.state !== 'completed' &&
          current.state !== 'finalization_failed' &&
          current.state !== 'finalizing'
        ) {
          throw new ConflictError({ reason: 'document_not_flattenable' });
        }
        const nextState =
          current.state === 'completed' || current.state === 'finalization_failed'
            ? 'finalizing'
            : current.state === 'sent'
              ? 'in_progress'
              : current.state;
        return {
          ...current,
          state: nextState,
          leaseOwner: input.owner,
          leaseUntil: input.leaseUntil,
          finalizationAttemptCount:
            nextState === 'finalizing'
              ? current.finalizationAttemptCount + 1
              : current.finalizationAttemptCount,
        };
      });
    },
    async commitFlattenedRevision(input) {
      return bumpDocument(records, input, (current) => {
        if (current.leaseOwner !== input.owner) {
          throw new ConflictError({ reason: 'document_lease', code: 'CONCURRENT_FINALIZATION' });
        }
        if (input.finalize) {
          if (current.state !== 'finalizing' && current.state !== 'completed') {
            throw new ConflictError({ reason: 'document_not_finalizable' });
          }
          return {
            ...current,
            state: 'finalized',
            currentRevisionId: input.revisionId,
            leaseOwner: null,
            leaseUntil: null,
          };
        }
        return {
          ...current,
          currentRevisionId: input.revisionId,
          leaseOwner: null,
          leaseUntil: null,
        };
      });
    },
    async markFinalizationFailed(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.documentId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'document' });
      }
      if (current.leaseOwner !== input.owner && current.state !== 'finalizing') {
        return current;
      }
      const updated: Document = {
        ...current,
        state: current.state === 'finalizing' ? 'finalization_failed' : current.state,
        leaseOwner: null,
        leaseUntil: null,
        version: current.version + 1,
      };
      records[index] = updated;
      return updated;
    },
    async releaseProcessingLease(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.documentId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        return;
      }
      if (current.leaseOwner !== input.owner) {
        return;
      }
      records[index] = {
        ...current,
        leaseOwner: null,
        leaseUntil: null,
        version: current.version + 1,
      };
    },
  };
}

function bumpDocument(
  records: Document[],
  input: { organizationId: string; documentId: string; expectedVersion: number },
  update: (current: Document) => Document,
): Document {
  const index = records.findIndex(
    (row) => row.organizationId === input.organizationId && row.id === input.documentId,
  );
  const current = records[index];
  if (index === -1 || current === undefined) {
    throw new NotFoundError({ resource: 'document' });
  }
  if (current.version !== input.expectedVersion) {
    throw new ConflictError({ reason: 'document_version' });
  }
  const updated: Document = {
    ...update(current),
    version: current.version + 1,
  };
  records[index] = updated;
  return updated;
}

export type MemoryDocumentRevisionRepository = DocumentRevisionRepository & {
  records: DocumentRevision[];
};

export function createMemoryDocumentRevisionRepository(
  revisions: DocumentRevision[] = [],
): MemoryDocumentRevisionRepository {
  const records = [...revisions];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.revisionId,
        ) ?? null
      );
    },
    async listByDocument(input) {
      return records.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
    },
    async create(input) {
      records.push(input.revision);
      return input.revision;
    },
    async findFirstByObjectKey(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.objectKey === input.objectKey,
        ) ?? null
      );
    },
  };
}

export type MemoryUploadSessionStore = UploadSessionRepository &
  UploadSessionLookup & {
    records: UploadSession[];
  };

export function createMemoryUploadSessionStore(
  sessions: UploadSession[] = [],
): MemoryUploadSessionStore {
  const records = [...sessions];
  return {
    records,
    async create(input) {
      records.push(input.session);
      return input.session;
    },
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.uploadSessionId,
        ) ?? null
      );
    },
    async complete(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.uploadSessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'upload_session' });
      }
      const updated: UploadSession = {
        ...current,
        status: 'completed',
        completedAt: input.completedAt,
        revisionId: input.revisionId,
        updatedAt: input.completedAt,
      };
      records[index] = updated;
      return updated;
    },
    async markAbandoned(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.uploadSessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'upload_session' });
      }
      const updated: UploadSession = {
        ...current,
        status: 'abandoned',
        updatedAt: input.abandonedAt,
      };
      records[index] = updated;
      return updated;
    },
    async findByTokenHash(tokenHash) {
      return records.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async listExpiredIssued(input) {
      return records
        .filter((row) => row.status === 'issued' && row.expiresAt.getTime() <= input.now.getTime())
        .slice(0, input.limit);
    },
  };
}

export type MemoryPreviewGrantStore = PreviewGrantRepository &
  PreviewGrantLookup & {
    records: PreviewGrant[];
  };

export function createMemoryPreviewGrantStore(
  grants: PreviewGrant[] = [],
): MemoryPreviewGrantStore {
  const records = [...grants];
  return {
    records,
    async create(input) {
      records.push(input.grant);
      return input.grant;
    },
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.grantId,
        ) ?? null
      );
    },
    async findByTokenHash(tokenHash) {
      return records.find((row) => row.tokenHash === tokenHash) ?? null;
    },
  };
}

export type MemoryIdempotencyRecordRepository = IdempotencyRecordRepository & {
  records: IdempotencyRecord[];
};

export function createMemoryIdempotencyRecordRepository(): MemoryIdempotencyRecordRepository {
  const records: IdempotencyRecord[] = [];
  return {
    records,
    async find(input) {
      return (
        records.find(
          (row) =>
            row.organizationId === input.organizationId &&
            row.principalId === input.principalId &&
            row.route === input.route &&
            row.key === input.key,
        ) ?? null
      );
    },
    async create(input) {
      const duplicate = records.find(
        (row) =>
          row.organizationId === input.organizationId &&
          row.principalId === input.record.principalId &&
          row.route === input.record.route &&
          row.key === input.record.key,
      );
      if (duplicate) {
        throw new ConflictError({ reason: 'idempotency_key' });
      }
      records.push(input.record);
      return input.record;
    },
    async complete(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.recordId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'idempotency_record' });
      }
      const updated: IdempotencyRecord = {
        ...current,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
        updatedAt: current.updatedAt,
      };
      records[index] = updated;
      return updated;
    },
  };
}

export type MemoryAuditWriter = AuditWriter & {
  events: AuditEvent[];
  logs: AuditLogRepository;
};

function createDocumentLock(): (
  key: string,
  work: () => Promise<AuditEvent>,
) => Promise<AuditEvent> {
  const tails = new Map<string, Promise<unknown>>();
  return async (key, work) => {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(
      key,
      previous.then(
        () => gate,
        () => gate,
      ),
    );
    await previous.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await work();
    } finally {
      release();
    }
  };
}

export function createMemoryAuditWriter(seed: readonly AuditEvent[] = []): MemoryAuditWriter {
  const events: AuditEvent[] = [...seed];
  const serialize = createDocumentLock();

  const logs: AuditLogRepository = {
    async findLatest(input) {
      const matching = events.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
      if (matching.length === 0) {
        return null;
      }
      return matching.reduce((head, row) => (row.sequence > head.sequence ? row : head));
    },
    async listByDocument(input) {
      return events.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
    },
    async append(input) {
      events.push(input.event);
      return input.event;
    },
  };

  return {
    events,
    logs,
    async append(event) {
      return serialize(`${event.organizationId}:${event.documentId}`, async () => {
        assertApprovedAuditPayload(event.payload);
        const latest = await logs.findLatest({
          organizationId: event.organizationId,
          documentId: event.documentId,
        });
        const sequence = latest ? latest.sequence + 1 : 0;
        const previousEventHash = latest?.eventHash ?? AUDIT_GENESIS_PREVIOUS_EVENT_HASH;
        const stored: AuditEvent = {
          id: event.id,
          organizationId: event.organizationId,
          documentId: event.documentId,
          sequence,
          type: event.type,
          actorType: event.actorType,
          actorId: event.actorId,
          occurredAt: event.occurredAt,
          payload: event.payload,
          previousEventHash,
          eventHash: computeAuditEventHash({
            schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
            previousEventHash,
            sequence,
            type: event.type,
            actorType: event.actorType,
            actorId: event.actorId,
            occurredAt: event.occurredAt,
            payload: event.payload,
          }),
          requestId: event.requestId ?? null,
          chainVersion: AUDIT_CHAIN_SCHEMA_VERSION,
          createdAt: event.occurredAt,
        };
        events.push(stored);
        return stored;
      });
    },
  };
}

export type MemoryJobPublisher = JobPublisher & { events: OutboxEvent[]; jobs: BackgroundJob[] };

export function createMemoryJobPublisher(): MemoryJobPublisher {
  const events: OutboxEvent[] = [];
  const jobs: BackgroundJob[] = [];
  return {
    events,
    jobs,
    async publish(input: JobPublishInput) {
      assertSafeJobPayload(input.payload);
      const at = input.availableAt ?? new Date(0);
      const event: OutboxEvent = {
        id: input.id,
        organizationId: input.organizationId,
        documentId: input.documentId ?? null,
        type: input.type,
        status: 'pending',
        payload: input.payload,
        requestId: input.requestId ?? null,
        attemptCount: 0,
        leaseOwner: null,
        leaseUntil: null,
        availableAt: at,
        processedAt: null,
        lastErrorCode: null,
        createdAt: at,
        updatedAt: at,
      };
      const job: BackgroundJob = {
        id: input.jobId ?? input.id,
        organizationId: input.organizationId,
        documentId: input.documentId ?? null,
        outboxEventId: input.id,
        type: input.type,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
        leaseOwner: null,
        leaseUntil: null,
        availableAt: at,
        lastErrorCode: null,
        requestId: input.requestId ?? null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      events.push(event);
      jobs.push(job);
      return event;
    },
  };
}

export type MemorySignerStore = SignerRepository & { records: Signer[] };

export function createMemorySignerStore(signers: Signer[] = []): MemorySignerStore {
  const records = [...signers];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.signerId,
        ) ?? null
      );
    },
    async listByDocument(input) {
      return records
        .filter(
          (row) =>
            row.organizationId === input.organizationId && row.documentId === input.documentId,
        )
        .sort((left, right) => left.routingOrder - right.routingOrder);
    },
    async replaceAll(input) {
      const nextIds = new Set(input.signers.map((signer) => signer.id));
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const row = records[index];
        if (
          row &&
          row.organizationId === input.organizationId &&
          row.documentId === input.documentId &&
          !nextIds.has(row.id)
        ) {
          records.splice(index, 1);
        }
      }
      const stored: Signer[] = [];
      for (const signer of input.signers) {
        const index = records.findIndex(
          (row) => row.organizationId === input.organizationId && row.id === signer.id,
        );
        if (index === -1) {
          records.push(signer);
          stored.push(signer);
        } else {
          records[index] = signer;
          stored.push(signer);
        }
      }
      return stored;
    },
    async markDeclined(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.signerId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signer' });
      }
      if (current.version !== input.expectedVersion || current.status !== 'pending') {
        throw new ConflictError({ reason: 'signer_version' });
      }
      const updated: Signer = {
        ...current,
        status: 'declined',
        declinedAt: input.declinedAt,
        version: current.version + 1,
      };
      records[index] = updated;
      return updated;
    },
    async markSigned(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.signerId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signer' });
      }
      if (current.status === 'signed') {
        return current;
      }
      if (current.version !== input.expectedVersion || current.status !== 'pending') {
        throw new ConflictError({ reason: 'signer_version' });
      }
      const updated: Signer = {
        ...current,
        status: 'signed',
        completedAt: input.completedAt,
        version: current.version + 1,
      };
      records[index] = updated;
      return updated;
    },
  };
}

export type MemorySignatureFieldStore = SignatureFieldRepository & { records: SignatureField[] };

export function createMemorySignatureFieldStore(
  fields: SignatureField[] = [],
): MemorySignatureFieldStore {
  const records = [...fields];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.fieldId,
        ) ?? null
      );
    },
    async listByDocument(input) {
      return records.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
    },
    async replaceAll(input) {
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const row = records[index];
        if (
          row &&
          row.organizationId === input.organizationId &&
          row.documentId === input.documentId
        ) {
          records.splice(index, 1);
        }
      }
      records.push(...input.fields);
      return [...input.fields];
    },
    async complete(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.fieldId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      const updated: SignatureField = {
        ...current,
        completedAt: input.completedAt,
        completionObjectKey: input.completionObjectKey,
        completionContentType: input.completionContentType,
        completionSizeBytes: input.completionSizeBytes,
        completionSha256Digest: input.completionSha256Digest,
      };
      records[index] = updated;
      return updated;
    },
    async markFlattened(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.fieldId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signature_field' });
      }
      const updated: SignatureField = {
        ...current,
        flattenedRevisionId: input.flattenedRevisionId,
      };
      records[index] = updated;
      return updated;
    },
    async findFirstByCompletionObjectKey(input) {
      return (
        records.find(
          (row) =>
            row.organizationId === input.organizationId &&
            row.completionObjectKey === input.objectKey,
        ) ?? null
      );
    },
  };
}

export type MemorySigningSessionStore = SigningSessionRepository &
  SigningTokenLookup & {
    records: SigningSession[];
  };

export function createMemorySigningSessionStore(
  sessions: SigningSession[] = [],
): MemorySigningSessionStore {
  const records = [...sessions];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
        ) ?? null
      );
    },
    async listBySigner(input) {
      return records.filter(
        (row) => row.organizationId === input.organizationId && row.signerId === input.signerId,
      );
    },
    async listByDocument(input) {
      return records.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
    },
    async listOpenBySigner(input) {
      return records.filter(
        (row) =>
          row.organizationId === input.organizationId &&
          row.signerId === input.signerId &&
          (row.status === 'issued' || row.status === 'active'),
      );
    },
    async create(input) {
      const open = records.find(
        (row) =>
          row.organizationId === input.organizationId &&
          row.signerId === input.session.signerId &&
          (row.status === 'issued' || row.status === 'active'),
      );
      if (open) {
        throw new ConflictError({ reason: 'duplicate_open_session' });
      }
      records.push(input.session);
      return input.session;
    },
    async revoke(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      if (current.status !== 'issued' && current.status !== 'active') {
        throw new ConflictError({ reason: 'session_not_open' });
      }
      const updated: SigningSession = {
        ...current,
        status: 'revoked',
        revokedAt: input.revokedAt,
      };
      records[index] = updated;
      return updated;
    },
    async markPresented(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      if (current.status === 'active') {
        const updated: SigningSession = { ...current, lastPresentedAt: input.presentedAt };
        records[index] = updated;
        return updated;
      }
      if (current.status !== 'issued') {
        throw new ConflictError({ reason: 'session_not_presentable', status: current.status });
      }
      const updated: SigningSession = {
        ...current,
        status: 'active',
        lastPresentedAt: input.presentedAt,
      };
      records[index] = updated;
      return updated;
    },
    async markExpired(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      if (current.status !== 'issued' && current.status !== 'active') {
        throw new ConflictError({ reason: 'session_not_open' });
      }
      const updated: SigningSession = { ...current, status: 'expired' };
      records[index] = updated;
      return updated;
    },
    async consumeAndRotate(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      if (
        current.version !== input.expectedVersion ||
        current.consumedAt !== null ||
        (current.status !== 'issued' && current.status !== 'active')
      ) {
        throw new ConflictError({ reason: 'session_not_exchangeable' });
      }
      const updated: SigningSession = {
        ...current,
        tokenHash: input.tokenHash,
        csrfTokenHash: input.csrfTokenHash,
        consumedAt: input.consumedAt,
        status: 'active',
        lastPresentedAt: input.consumedAt,
        version: current.version + 1,
      };
      records[index] = updated;
      return updated;
    },
    async markCompleted(input) {
      const index = records.findIndex(
        (row) => row.organizationId === input.organizationId && row.id === input.sessionId,
      );
      const current = records[index];
      if (index === -1 || current === undefined) {
        throw new NotFoundError({ resource: 'signing_session' });
      }
      if (current.status === 'completed') {
        return current;
      }
      if (current.status !== 'issued' && current.status !== 'active') {
        throw new ConflictError({ reason: 'session_not_completable' });
      }
      const updated: SigningSession = {
        ...current,
        status: 'completed',
        completedAt: input.completedAt,
      };
      records[index] = updated;
      return updated;
    },
    async findByTokenHash(tokenHash) {
      return records.find((row) => row.tokenHash === tokenHash) ?? null;
    },
  };
}

export type MemoryConsentStore = ConsentRecordRepository & { records: ConsentRecord[] };

export function createMemoryConsentStore(consents: ConsentRecord[] = []): MemoryConsentStore {
  const records = [...consents];
  return {
    records,
    async findById(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.id === input.consentId,
        ) ?? null
      );
    },
    async findBySession(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.sessionId === input.sessionId,
        ) ?? null
      );
    },
    async listByDocument(input) {
      return records.filter(
        (row) => row.organizationId === input.organizationId && row.documentId === input.documentId,
      );
    },
    async create(input) {
      if (
        records.some(
          (row) =>
            row.organizationId === input.organizationId &&
            row.sessionId === input.consent.sessionId,
        )
      ) {
        throw new ConflictError({ reason: 'consent_exists' });
      }
      records.push(input.consent);
      return input.consent;
    },
  };
}

export type MemoryFinalizedArtifactStore = FinalizedArtifactRepository & {
  records: FinalizedArtifact[];
};

export function createMemoryFinalizedArtifactStore(
  artifacts: FinalizedArtifact[] = [],
): MemoryFinalizedArtifactStore {
  const records = [...artifacts];
  return {
    records,
    async findByDocument(input) {
      return (
        records.find(
          (row) =>
            row.organizationId === input.organizationId && row.documentId === input.documentId,
        ) ?? null
      );
    },
    async create(input) {
      if (
        records.some(
          (row) =>
            row.organizationId === input.organizationId &&
            row.documentId === input.artifact.documentId,
        )
      ) {
        throw new ConflictError({ reason: 'artifact_exists' });
      }
      records.push(input.artifact);
      return input.artifact;
    },
    async findFirstByObjectKey(input) {
      return (
        records.find(
          (row) => row.organizationId === input.organizationId && row.objectKey === input.objectKey,
        ) ?? null
      );
    },
  };
}

export function createMemoryUnitOfWork(scope: TransactionScope): UnitOfWork {
  return {
    async run(work) {
      return work(scope);
    },
  };
}

async function unusedMemoryRepo(): Promise<never> {
  throw new Error('unused memory repository method');
}

export function createMemoryDocumentScope(input: {
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  uploadSessions: UploadSessionRepository;
  previewGrants: PreviewGrantRepository;
  idempotencyRecords: IdempotencyRecordRepository;
  audit: AuditWriter;
  jobs: JobPublisher;
  auditLogs?: AuditLogRepository;
  signers?: SignerRepository;
  signatureFields?: SignatureFieldRepository;
  signingSessions?: SigningSessionRepository;
  consentRecords?: ConsentRecordRepository;
  finalizedArtifacts?: FinalizedArtifactRepository;
}): TransactionScope {
  return {
    organizations: { findById: unusedMemoryRepo },
    memberships: { findById: unusedMemoryRepo, findByUser: unusedMemoryRepo },
    documents: input.documents,
    revisions: input.revisions,
    uploadSessions: input.uploadSessions,
    previewGrants: input.previewGrants,
    signers: input.signers ?? {
      findById: unusedMemoryRepo,
      listByDocument: unusedMemoryRepo,
      replaceAll: unusedMemoryRepo,
      markDeclined: unusedMemoryRepo,
      markSigned: unusedMemoryRepo,
    },
    signingSessions: input.signingSessions ?? {
      findById: unusedMemoryRepo,
      listBySigner: unusedMemoryRepo,
      listByDocument: unusedMemoryRepo,
      listOpenBySigner: unusedMemoryRepo,
      create: unusedMemoryRepo,
      revoke: unusedMemoryRepo,
      markPresented: unusedMemoryRepo,
      markExpired: unusedMemoryRepo,
      consumeAndRotate: unusedMemoryRepo,
      markCompleted: unusedMemoryRepo,
    },
    signatureFields: input.signatureFields ?? {
      findById: unusedMemoryRepo,
      listByDocument: unusedMemoryRepo,
      replaceAll: unusedMemoryRepo,
      complete: unusedMemoryRepo,
      markFlattened: unusedMemoryRepo,
      findFirstByCompletionObjectKey: unusedMemoryRepo,
    },
    consentRecords: input.consentRecords ?? {
      findById: unusedMemoryRepo,
      findBySession: unusedMemoryRepo,
      listByDocument: unusedMemoryRepo,
      create: unusedMemoryRepo,
    },
    finalizedArtifacts: input.finalizedArtifacts ?? {
      findByDocument: unusedMemoryRepo,
      create: unusedMemoryRepo,
      findFirstByObjectKey: unusedMemoryRepo,
    },
    auditLogs: input.auditLogs ?? {
      findLatest: unusedMemoryRepo,
      listByDocument: unusedMemoryRepo,
      append: unusedMemoryRepo,
    },
    outboxEvents: { findById: unusedMemoryRepo, create: unusedMemoryRepo },
    backgroundJobs: { findById: unusedMemoryRepo },
    idempotencyRecords: input.idempotencyRecords,
    audit: input.audit,
    jobs: input.jobs,
  };
}
