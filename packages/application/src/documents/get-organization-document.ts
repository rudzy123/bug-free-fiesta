import {
  organizationContextFromActor,
  NotFoundError,
  type AccountUserActor,
  type AuthorizationPolicy,
  type DocumentRepository,
  type DocumentRevisionRepository,
} from '@esign/domain';
import { toPublicDocument, type PublicDocument } from './public-document.js';

export type GetOrganizationDocumentInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
};

export function createGetOrganizationDocument(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
}) {
  return async function getOrganizationDocument(
    input: GetOrganizationDocumentInput,
  ): Promise<PublicDocument> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.read', {
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
    const revision =
      document.currentRevisionId === null
        ? null
        : await deps.revisions.findById({
            organizationId,
            revisionId: document.currentRevisionId,
          });
    return toPublicDocument(document, revision);
  };
}

export type GetOrganizationDocument = ReturnType<typeof createGetOrganizationDocument>;
