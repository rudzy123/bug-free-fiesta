import {
  ExternalServiceError,
  INSPECT_DOCUMENT_JOB_TYPE,
  NotFoundError,
  type Clock,
  type DocumentInspector,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type IdGenerator,
  type ObjectStorage,
  type UnitOfWork,
} from '@esign/domain';

export type InspectDocumentInput = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly revisionId: string;
  readonly jobId: string;
  readonly outboxEventId?: string;
  readonly requestId: string | null;
};

export function createInspectDocument(deps: {
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  storage: ObjectStorage;
  inspector: DocumentInspector;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function inspectDocument(input: InspectDocumentInput): Promise<{
    inspectionStatus: 'accepted' | 'rejected';
  }> {
    const document = await deps.documents.findById({
      organizationId: input.organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }
    if (document.inspectionStatus !== 'pending') {
      return {
        inspectionStatus: document.inspectionStatus === 'accepted' ? 'accepted' : 'rejected',
      };
    }
    if (document.currentRevisionId !== input.revisionId) {
      throw new NotFoundError({ resource: 'revision' });
    }

    const revision = await deps.revisions.findById({
      organizationId: input.organizationId,
      revisionId: input.revisionId,
    });
    if (!revision) {
      throw new NotFoundError({ resource: 'revision' });
    }

    const stored = await deps.storage.getObject({
      organizationId: input.organizationId,
      key: revision.objectKey,
    });
    if (!stored) {
      throw new ExternalServiceError({ service: 'object-storage', reason: 'missing_object' });
    }

    const outcome = await deps.inspector.inspect({
      organizationId: input.organizationId,
      documentId: input.documentId,
      revisionId: input.revisionId,
      contentType: revision.contentType,
      body: stored.body,
    });

    const now = deps.clock.nowUtc();
    await deps.unitOfWork.run(async (scope) => {
      await scope.documents.setInspectionStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        expectedVersion: document.version,
        inspectionStatus: outcome.status,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: input.organizationId,
        documentId: input.documentId,
        type: outcome.status === 'accepted' ? 'inspection_accepted' : 'inspection_rejected',
        actorType: 'worker',
        actorId: input.jobId,
        occurredAt: now,
        payload: {
          revisionId: input.revisionId,
          reasonCode: outcome.reasonCode,
          jobType: INSPECT_DOCUMENT_JOB_TYPE,
          ...(input.outboxEventId ? { outboxEventId: input.outboxEventId } : {}),
        },
        requestId: input.requestId,
      });
    });

    return { inspectionStatus: outcome.status };
  };
}

export type InspectDocument = ReturnType<typeof createInspectDocument>;
