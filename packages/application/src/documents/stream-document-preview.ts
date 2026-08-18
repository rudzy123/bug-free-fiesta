import {
  AuthenticationError,
  NotFoundError,
  type Clock,
  type DocumentRevisionRepository,
  type ObjectStorage,
  type PreviewGrantLookup,
  type SigningTokenHasher,
} from '@esign/domain';

export type StreamDocumentPreviewInput = {
  readonly grantId: string;
  readonly rawToken: string;
};

export type StreamDocumentPreviewResult = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly displayName: string;
};

export function createStreamDocumentPreview(deps: {
  grants: PreviewGrantLookup;
  revisions: DocumentRevisionRepository;
  storage: ObjectStorage;
  hasher: SigningTokenHasher;
  clock: Clock;
}) {
  return async function streamDocumentPreview(
    input: StreamDocumentPreviewInput,
  ): Promise<StreamDocumentPreviewResult> {
    const grant = await deps.grants.findByTokenHash(deps.hasher.hash(input.rawToken));
    if (!grant || grant.id !== input.grantId) {
      throw new AuthenticationError({ reason: 'preview_token' });
    }
    if (grant.expiresAt.getTime() <= deps.clock.nowUtc().getTime()) {
      throw new AuthenticationError({ reason: 'preview_expired' });
    }
    const revision = await deps.revisions.findById({
      organizationId: grant.organizationId,
      revisionId: grant.revisionId,
    });
    if (!revision) {
      throw new NotFoundError({ resource: 'revision' });
    }
    const stored = await deps.storage.getObject({
      organizationId: grant.organizationId,
      key: revision.objectKey,
    });
    if (!stored) {
      throw new NotFoundError({ resource: 'object' });
    }
    return {
      body: stored.body,
      contentType: stored.contentType,
      displayName: revision.displayName,
    };
  };
}

export type StreamDocumentPreview = ReturnType<typeof createStreamDocumentPreview>;
