import {
  ConflictError,
  NotFoundError,
  type AuditEvent,
  type AuditWriter,
  type Document,
  type DocumentRepository,
  type DocumentRevision,
  type DocumentRevisionRepository,
  type IdempotencyRecord,
  type IdempotencyRecordRepository,
  type JobPublishInput,
  type JobPublisher,
  type NewAuditEvent,
  type OutboxEvent,
  type PreviewGrant,
  type PreviewGrantLookup,
  type PreviewGrantRepository,
  type TransactionScope,
  type UnitOfWork,
  type UploadSession,
  type UploadSessionLookup,
  type UploadSessionRepository,
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
  };
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

export type MemoryAuditWriter = AuditWriter & { events: NewAuditEvent[] };

export function createMemoryAuditWriter(): MemoryAuditWriter {
  const events: NewAuditEvent[] = [];
  return {
    events,
    async append(event) {
      events.push(event);
      const stored: AuditEvent = {
        id: event.id,
        organizationId: event.organizationId,
        documentId: event.documentId,
        sequence: events.length - 1,
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        payload: event.payload,
        previousEventHash: '0'.repeat(64),
        eventHash: 'a'.repeat(64),
        requestId: event.requestId ?? null,
        chainVersion: 1,
        createdAt: event.occurredAt,
      };
      return stored;
    },
  };
}

export type MemoryJobPublisher = JobPublisher & { events: OutboxEvent[] };

export function createMemoryJobPublisher(): MemoryJobPublisher {
  const events: OutboxEvent[] = [];
  return {
    events,
    async publish(input: JobPublishInput) {
      const event: OutboxEvent = {
        id: input.id,
        organizationId: input.organizationId,
        documentId: input.documentId ?? null,
        type: input.type,
        status: 'pending',
        payload: input.payload,
        requestId: input.requestId ?? null,
        attemptCount: 0,
        availableAt: input.availableAt ?? new Date(0),
        processedAt: null,
        lastErrorCode: null,
        createdAt: input.availableAt ?? new Date(0),
        updatedAt: input.availableAt ?? new Date(0),
      };
      events.push(event);
      return event;
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
}): TransactionScope {
  return {
    organizations: { findById: unusedMemoryRepo },
    memberships: { findById: unusedMemoryRepo, findByUser: unusedMemoryRepo },
    documents: input.documents,
    revisions: input.revisions,
    uploadSessions: input.uploadSessions,
    previewGrants: input.previewGrants,
    signers: { findById: unusedMemoryRepo, listByDocument: unusedMemoryRepo },
    signingSessions: { findById: unusedMemoryRepo, listBySigner: unusedMemoryRepo },
    signatureFields: { findById: unusedMemoryRepo, listByDocument: unusedMemoryRepo },
    consentRecords: { findById: unusedMemoryRepo, listByDocument: unusedMemoryRepo },
    finalizedArtifacts: { findByDocument: unusedMemoryRepo },
    auditLogs: {
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
