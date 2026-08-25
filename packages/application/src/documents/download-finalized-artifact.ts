import {
  actorId,
  actorType,
  ConflictError,
  IntegrityError,
  NotFoundError,
  organizationContextFromActor,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type FinalizedArtifactRepository,
  type Hashing,
  type IdGenerator,
  type ObjectStorage,
  type UnitOfWork,
} from '@esign/domain';
import { PDF_CONTENT_TYPE, sanitizeDisplayFilename } from './pdf.js';

export type DownloadFinalizedArtifactInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly requestId: string;
};

export type DownloadFinalizedArtifactResult = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly displayName: string;
  readonly sha256Digest: string;
  readonly sizeBytes: number;
};

export function createDownloadFinalizedArtifact(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  artifacts: FinalizedArtifactRepository;
  storage: ObjectStorage;
  hashing: Hashing;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function downloadFinalizedArtifact(
    input: DownloadFinalizedArtifactInput,
  ): Promise<DownloadFinalizedArtifactResult> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.download_artifact', {
      organizationId,
      documentId: input.documentId,
    });
    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }
    if (document.state !== 'finalized') {
      throw new ConflictError({ reason: 'artifact_not_ready' });
    }
    const artifact = await deps.artifacts.findByDocument({
      organizationId,
      documentId: document.id,
    });
    if (!artifact) {
      throw new NotFoundError({ resource: 'artifact' });
    }

    const stored = await deps.storage.getObject({
      organizationId,
      key: artifact.objectKey,
    });
    if (!stored) {
      throw new NotFoundError({ resource: 'object' });
    }
    const digest = deps.hashing.sha256Hex(stored.body);
    if (digest !== artifact.sha256Digest || digest !== stored.sha256Digest) {
      throw new IntegrityError({
        reason: 'object_digest_mismatch',
        code: 'FINAL_OBJECT_INTEGRITY_FAILURE',
      });
    }

    const now = deps.clock.nowUtc();
    await deps.unitOfWork.run(async (scope) => {
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'artifact_downloaded',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: {
          artifactId: artifact.id,
          sha256Digest: artifact.sha256Digest,
        },
        requestId: input.requestId,
      });
    });

    return {
      body: stored.body,
      contentType: PDF_CONTENT_TYPE,
      displayName: downloadDisplayName(document.sourceDisplayName),
      sha256Digest: artifact.sha256Digest,
      sizeBytes: stored.body.byteLength,
    };
  };
}

export type DownloadFinalizedArtifact = ReturnType<typeof createDownloadFinalizedArtifact>;

function downloadDisplayName(sourceDisplayName: string | null): string {
  const candidate = sourceDisplayName ?? 'finalized.pdf';
  try {
    return sanitizeDisplayFilename(candidate);
  } catch {
    return 'finalized.pdf';
  }
}
