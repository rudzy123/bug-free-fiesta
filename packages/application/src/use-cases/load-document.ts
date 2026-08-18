import {
  NotFoundError,
  organizationContextFromActor,
  type AuthorizationPolicy,
  type Document,
  type DocumentRepository,
  type RequestActor,
} from '@esign/domain';

export type LoadDocumentInput = {
  readonly actor: RequestActor;
  readonly documentId: string;
};

export function createLoadDocument(deps: {
  documents: DocumentRepository;
  authorization: AuthorizationPolicy;
}) {
  return async function loadDocument(input: LoadDocumentInput): Promise<Document> {
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
    return document;
  };
}

export type LoadDocument = ReturnType<typeof createLoadDocument>;
