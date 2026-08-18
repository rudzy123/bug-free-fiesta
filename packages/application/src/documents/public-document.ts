import {
  isAvailableForSigning,
  type Document,
  type DocumentRevision,
  type SignatureField,
  type Signer,
} from '@esign/domain';

export type PublicDocumentRevision = {
  readonly revisionId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256Digest: string;
  readonly displayName: string;
  readonly pageCount: number;
};

export type PublicSigner = {
  readonly signerId: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly routingOrder: number;
  readonly status: Signer['status'];
};

export type PublicSignatureField = {
  readonly fieldId: string;
  readonly signerId: string;
  readonly type: SignatureField['type'];
  readonly pageNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly required: boolean;
};

export type PublicDocument = {
  readonly documentId: string;
  readonly title: string;
  readonly state: Document['state'];
  readonly signingMode: Document['signingMode'];
  readonly inspectionStatus: Document['inspectionStatus'];
  readonly displayName: string | null;
  readonly availableForSigning: boolean;
  readonly currentRevision: PublicDocumentRevision | null;
  readonly signers: readonly PublicSigner[];
  readonly fields: readonly PublicSignatureField[];
};

export function toPublicSigner(signer: Signer): PublicSigner {
  return {
    signerId: signer.id,
    email: signer.email,
    displayName: signer.displayName,
    routingOrder: signer.routingOrder,
    status: signer.status,
  };
}

export function toPublicSignatureField(field: SignatureField): PublicSignatureField {
  return {
    fieldId: field.id,
    signerId: field.signerId,
    type: field.type,
    pageNumber: field.pageNumber,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    required: field.required,
  };
}

export function toPublicDocument(
  document: Document,
  revision: DocumentRevision | null,
  extras: {
    signers?: readonly Signer[];
    fields?: readonly SignatureField[];
  } = {},
): PublicDocument {
  return {
    documentId: document.id,
    title: document.title,
    state: document.state,
    signingMode: document.signingMode,
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
          pageCount: revision.pageCount,
        }
      : null,
    signers: (extras.signers ?? []).map(toPublicSigner),
    fields: (extras.fields ?? []).map(toPublicSignatureField),
  };
}
