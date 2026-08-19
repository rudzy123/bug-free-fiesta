import {
  assertTenantObjectKey,
  type Clock,
  type ObjectStorage,
  type UnitOfWork,
} from '@esign/domain';

export function createCleanupOrphanedObjects(deps: {
  storage: ObjectStorage;
  unitOfWork: UnitOfWork;
  clock: Clock;
  olderThanMs: number;
  prefixes?: readonly string[];
}) {
  const prefixes = deps.prefixes ?? ['revisions/', 'artifacts/', 'signatures/'];
  return async function cleanupOrphanedObjects(input: {
    organizationId: string;
  }): Promise<{ deleted: number }> {
    const olderThan = new Date(deps.clock.nowUtc().getTime() - deps.olderThanMs);
    let deleted = 0;
    for (const prefix of prefixes) {
      const keys = await deps.storage.listKeys({
        organizationId: input.organizationId,
        prefix,
        olderThan,
      });
      for (const key of keys) {
        assertTenantObjectKey(input.organizationId, key);
        const referenced = await deps.unitOfWork.run(async (scope) => {
          const revision = await scope.revisions.findFirstByObjectKey({
            organizationId: input.organizationId,
            objectKey: key,
          });
          if (revision) {
            return true;
          }
          const artifact = await scope.finalizedArtifacts.findFirstByObjectKey({
            organizationId: input.organizationId,
            objectKey: key,
          });
          if (artifact) {
            return true;
          }
          const field = await scope.signatureFields.findFirstByCompletionObjectKey({
            organizationId: input.organizationId,
            objectKey: key,
          });
          return field !== null;
        });
        if (!referenced) {
          await deps.storage.deleteObject({ organizationId: input.organizationId, key });
          deleted += 1;
        }
      }
    }
    return { deleted };
  };
}

export type CleanupOrphanedObjects = ReturnType<typeof createCleanupOrphanedObjects>;
