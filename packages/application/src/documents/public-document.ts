import { isAvailableForSigning, type Document, type DocumentRevision } from '@esign/domain';

export type PublicDocumentRevision = {
  readonly revisionId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256Digest: string;
  readonly displayName: string;
};

export type PublicDocument = {
  readonly documentId: string;
  readonly title: string;
  readonly state: Document['state'];
  readonly inspectionStatus: Document['inspectionStatus'];
  readonly displayName: string | null;
  readonly availableForSigning: boolean;
  readonly currentRevision: PublicDocumentRevision | null;
};

export function toPublicDocument(
  document: Document,
  revision: DocumentRevision | null,
): PublicDocument {
  return {
    documentId: document.id,
    title: document.title,
    state: document.state,
    inspectionStatus: document.inspectionStatus,
    displayName: document.sourceDisplayName,
    availableForSigning: isAvailableForSigning(document),
    currentRevision: revision
      ? {
          revisionId: revision.id,
          contentType: revision.contentType,
          sizeBytes: Number(revision.sizeBytes),
          sha256Digest: revision.sha256Digest,
          displayName: revision.displayName,
        }
      : null,
  };
}
