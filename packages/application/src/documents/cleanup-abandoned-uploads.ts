import {
  actorId,
  type Clock,
  type IdGenerator,
  type UnitOfWork,
  type UploadSessionLookup,
} from '@esign/domain';

export function createCleanupAbandonedUploads(deps: {
  uploadSessions: UploadSessionLookup;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  limit: number;
}) {
  return async function cleanupAbandonedUploads(): Promise<{ abandoned: number }> {
    const now = deps.clock.nowUtc();
    const expired = await deps.uploadSessions.listExpiredIssued({ now, limit: deps.limit });
    let abandoned = 0;
    for (const session of expired) {
      await deps.unitOfWork.run(async (scope) => {
        await scope.uploadSessions.markAbandoned({
          organizationId: session.organizationId,
          uploadSessionId: session.id,
          abandonedAt: now,
        });
        await scope.audit.append({
          id: deps.ids.next(),
          organizationId: session.organizationId,
          documentId: session.documentId,
          type: 'upload_abandoned',
          actorType: 'system',
          actorId: actorId({ type: 'system' }),
          occurredAt: now,
          payload: { uploadSessionId: session.id },
        });
      });
      abandoned += 1;
    }
    return { abandoned };
  };
}

export type CleanupAbandonedUploads = ReturnType<typeof createCleanupAbandonedUploads>;
