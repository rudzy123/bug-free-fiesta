import {
  NotFoundError,
  organizationContextFromActor,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type IdGenerator,
  type PreviewGrantRepository,
  type SigningTokenGenerator,
  type SigningTokenHasher,
} from '@esign/domain';

export type IssueDocumentPreviewInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
};

export type IssueDocumentPreviewResult = {
  readonly url: string;
  readonly expiresAt: string;
  readonly tokenHeader: string;
  readonly token: string;
  readonly contentType: string;
};

export function createIssueDocumentPreview(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  previewGrants: PreviewGrantRepository;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  ids: IdGenerator;
  clock: Clock;
  previewTtlMs: number;
  previewTokenHeader: string;
}) {
  return async function issueDocumentPreview(
    input: IssueDocumentPreviewInput,
  ): Promise<IssueDocumentPreviewResult> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.read', {
      organizationId,
      documentId: input.documentId,
    });
    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document || document.currentRevisionId === null) {
      throw new NotFoundError({ resource: 'document' });
    }
    const revision = await deps.revisions.findById({
      organizationId,
      revisionId: document.currentRevisionId,
    });
    if (!revision) {
      throw new NotFoundError({ resource: 'revision' });
    }

    const now = deps.clock.nowUtc();
    const rawToken = deps.tokens.generateRawToken();
    const grant = await deps.previewGrants.create({
      organizationId,
      grant: {
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        revisionId: revision.id,
        tokenHash: deps.hasher.hash(rawToken),
        expiresAt: new Date(now.getTime() + deps.previewTtlMs),
        createdAt: now,
      },
    });

    return {
      url: `/document-previews/${grant.id}`,
      expiresAt: grant.expiresAt.toISOString(),
      tokenHeader: deps.previewTokenHeader,
      token: rawToken,
      contentType: revision.contentType,
    };
  };
}

export type IssueDocumentPreview = ReturnType<typeof createIssueDocumentPreview>;
