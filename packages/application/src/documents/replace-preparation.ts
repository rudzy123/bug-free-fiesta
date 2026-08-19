import {
  actorId,
  actorType,
  assertFieldLayout,
  assertPreparationUnlocked,
  assertSignerRouting,
  assertedSigningMode,
  canTransitionDocument,
  organizationContextFromActor,
  SIGNATURE_FIELD_TYPES,
  ValidationError,
  NotFoundError,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type Document,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type FieldOverlapPolicy,
  type IdGenerator,
  type SignatureField,
  type SignatureFieldRepository,
  type SignatureFieldType,
  type Signer,
  type SignerRepository,
  type UnitOfWork,
} from '@esign/domain';
import { toPublicDocument, type PublicDocument } from './public-document.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReplaceSignersInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly signingMode: string;
  readonly signers: readonly {
    readonly signerId?: string;
    readonly email: string;
    readonly displayName: string;
    readonly routingOrder: number;
  }[];
  readonly requestId: string;
};

export function createReplaceDocumentSigners(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  signers: SignerRepository;
  fields: SignatureFieldRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function replaceDocumentSigners(
    input: ReplaceSignersInput,
  ): Promise<PublicDocument> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.write', {
      organizationId,
      documentId: input.documentId,
    });
    const document = await requireDocument(deps.documents, organizationId, input.documentId);
    assertPreparationUnlocked(document);
    const signingMode = assertedSigningMode(input.signingMode);
    const now = deps.clock.nowUtc();
    const existing = await deps.signers.listByDocument({ organizationId, documentId: document.id });
    const existingIds = new Set(existing.map((row) => row.id));
    const signers = input.signers.map((row) =>
      toSigner({
        row,
        organizationId,
        documentId: document.id,
        existingIds,
        ids: deps.ids,
        now,
      }),
    );
    assertSignerRouting({ signingMode, signers });
    const emails = new Set(signers.map((signer) => signer.email));
    if (emails.size !== signers.length) {
      throw new ValidationError({ field: 'email', reason: 'duplicate' });
    }

    const persisted = await deps.unitOfWork.run(async (scope) => {
      const replaced = await scope.signers.replaceAll({
        organizationId,
        documentId: document.id,
        signers,
      });
      const fields = await scope.signatureFields.listByDocument({
        organizationId,
        documentId: document.id,
      });
      const signerIds = new Set(replaced.map((row) => row.id));
      const keptFields = fields.filter((field) => signerIds.has(field.signerId));
      if (keptFields.length !== fields.length) {
        await scope.signatureFields.replaceAll({
          organizationId,
          documentId: document.id,
          fields: keptFields,
        });
      }
      let next = await scope.documents.setSigningMode({
        organizationId,
        documentId: document.id,
        expectedVersion: document.version,
        signingMode,
      });
      next = await maybeMarkPrepared(scope, {
        document: next,
        signers: replaced,
        fields: keptFields,
        revision: await loadRevision(deps.revisions, next),
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'signers_updated',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: { signerIds: replaced.map((row) => row.id), signingMode },
        requestId: input.requestId,
      });
      return { document: next, signers: replaced, fields: keptFields };
    });

    return toPublicDocument(
      persisted.document,
      await loadRevision(deps.revisions, persisted.document),
      {
        signers: persisted.signers,
        fields: persisted.fields,
      },
    );
  };
}

export type ReplaceDocumentSigners = ReturnType<typeof createReplaceDocumentSigners>;

export type ReplaceFieldsInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly overlapPolicy: FieldOverlapPolicy;
  readonly fields: readonly {
    readonly signerId: string;
    readonly type: string;
    readonly pageNumber: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly required?: boolean;
  }[];
  readonly requestId: string;
};

export function createReplaceDocumentFields(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  signers: SignerRepository;
  fields: SignatureFieldRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function replaceDocumentFields(input: ReplaceFieldsInput): Promise<PublicDocument> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.write', {
      organizationId,
      documentId: input.documentId,
    });
    const document = await requireDocument(deps.documents, organizationId, input.documentId);
    assertPreparationUnlocked(document);
    const revision = await loadRevision(deps.revisions, document);
    if (!revision) {
      throw new ValidationError({ reason: 'missing_revision' });
    }
    const signers = await deps.signers.listByDocument({ organizationId, documentId: document.id });
    if (signers.length === 0) {
      throw new ValidationError({ field: 'signers', reason: 'empty' });
    }
    const signerIds = new Set(signers.map((row) => row.id));
    const now = deps.clock.nowUtc();
    const fields = input.fields.map((row) => {
      if (!signerIds.has(row.signerId)) {
        throw new ValidationError({ field: 'signerId', reason: 'unknown_signer' });
      }
      if (!(SIGNATURE_FIELD_TYPES as readonly string[]).includes(row.type)) {
        throw new ValidationError({ field: 'type', reason: 'invalid' });
      }
      return {
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        signerId: row.signerId,
        type: row.type as SignatureFieldType,
        pageNumber: row.pageNumber,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        required: row.required ?? true,
        completedAt: null,
        completionObjectKey: null,
        completionContentType: null,
        completionSizeBytes: null,
        completionSha256Digest: null,
        flattenedRevisionId: null,
        createdAt: now,
        updatedAt: now,
      } satisfies SignatureField;
    });
    assertFieldLayout({
      fields,
      pageCount: revision.pageCount,
      overlapPolicy: input.overlapPolicy,
    });
    assertEachSignerHasField(signers, fields);

    const persisted = await deps.unitOfWork.run(async (scope) => {
      const replaced = await scope.signatureFields.replaceAll({
        organizationId,
        documentId: document.id,
        fields,
      });
      const next = await maybeMarkPrepared(scope, {
        document,
        signers,
        fields: replaced,
        revision,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'fields_updated',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: { fieldIds: replaced.map((row) => row.id) },
        requestId: input.requestId,
      });
      return { document: next, fields: replaced };
    });

    return toPublicDocument(persisted.document, revision, {
      signers,
      fields: persisted.fields,
    });
  };
}

export type ReplaceDocumentFields = ReturnType<typeof createReplaceDocumentFields>;

export function envelopeIsPrepared(input: {
  document: Document;
  signers: readonly Signer[];
  fields: readonly SignatureField[];
}): boolean {
  if (input.document.inspectionStatus !== 'accepted' || input.document.currentRevisionId === null) {
    return false;
  }
  if (input.signers.length < 1 || input.fields.length < 1) {
    return false;
  }
  try {
    assertSignerRouting({ signingMode: input.document.signingMode, signers: input.signers });
    assertEachSignerHasField(input.signers, input.fields);
    return true;
  } catch {
    return false;
  }
}

async function maybeMarkPrepared(
  scope: {
    documents: DocumentRepository;
  },
  input: {
    document: Document;
    signers: readonly Signer[];
    fields: readonly SignatureField[];
    revision: Awaited<ReturnType<DocumentRevisionRepository['findById']>>;
  },
): Promise<Document> {
  const prepared = envelopeIsPrepared(input);
  const nextState = prepared ? 'prepared' : 'draft';
  if (input.document.state === nextState) {
    return input.document;
  }
  if (!canTransitionDocument(input.document.state, nextState)) {
    return input.document;
  }
  return scope.documents.setPreparationState({
    organizationId: input.document.organizationId,
    documentId: input.document.id,
    expectedVersion: input.document.version,
    state: nextState,
  });
}

function assertEachSignerHasField(
  signers: readonly Signer[],
  fields: readonly SignatureField[],
): void {
  for (const signer of signers) {
    const assigned = fields.filter((field) => field.signerId === signer.id);
    if (assigned.length === 0) {
      throw new ValidationError({
        field: 'fields',
        reason: 'signer_missing_field',
        signerId: signer.id,
      });
    }
  }
}

function toSigner(input: {
  row: ReplaceSignersInput['signers'][number];
  organizationId: string;
  documentId: string;
  existingIds: Set<string>;
  ids: IdGenerator;
  now: Date;
}): Signer {
  const email = input.row.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError({ field: 'email', reason: 'invalid' });
  }
  const displayName = input.row.displayName.trim();
  if (displayName.length < 1 || displayName.length > 120) {
    throw new ValidationError({ field: 'displayName', reason: 'invalid' });
  }
  const signerId = input.row.signerId ?? input.ids.next();
  if (input.row.signerId !== undefined && !input.existingIds.has(input.row.signerId)) {
    throw new ValidationError({ field: 'signerId', reason: 'unknown_signer' });
  }
  return {
    id: signerId,
    organizationId: input.organizationId,
    documentId: input.documentId,
    accountUserId: null,
    routingOrder: input.row.routingOrder,
    status: 'pending',
    email,
    displayName,
    version: 1,
    completedAt: null,
    declinedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

async function requireDocument(
  documents: DocumentRepository,
  organizationId: string,
  documentId: string,
): Promise<Document> {
  const document = await documents.findById({ organizationId, documentId });
  if (!document) {
    throw new NotFoundError({ resource: 'document' });
  }
  return document;
}

async function loadRevision(revisions: DocumentRevisionRepository, document: Document) {
  if (document.currentRevisionId === null) {
    return null;
  }
  return revisions.findById({
    organizationId: document.organizationId,
    revisionId: document.currentRevisionId,
  });
}
