import {
  AuthenticationError,
  ConflictError,
  INSPECT_DOCUMENT_JOB_TYPE,
  IntegrityError,
  NotFoundError,
  sourceRevisionObjectKey,
  type Clock,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type Hashing,
  type IdGenerator,
  type ObjectStorage,
  type SigningTokenHasher,
  type UnitOfWork,
  type UploadSessionLookup,
} from '@esign/domain';
import {
  PDF_CONTENT_TYPE,
  assertPdfMagicBytes,
  assertUploadSize,
  assertedPdfContentType,
} from './pdf.js';
import { toPublicDocument, type PublicDocument } from './public-document.js';
import { extractPdfPageCount } from './pdf-pages.js';

export type CompleteSourceUploadInput = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly rawToken: string;
  readonly contentType: string | undefined;
  readonly body: Uint8Array;
  readonly requestId: string;
};

export type CompleteSourceUploadResult = PublicDocument;

export function createCompleteSourceUpload(deps: {
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  uploadSessions: UploadSessionLookup;
  hasher: SigningTokenHasher;
  hashing: Hashing;
  ids: IdGenerator;
  clock: Clock;
  storage: ObjectStorage;
  unitOfWork: UnitOfWork;
  maxUploadBytes: number;
}) {
  return async function completeSourceUpload(
    input: CompleteSourceUploadInput,
  ): Promise<CompleteSourceUploadResult> {
    const tokenHash = deps.hasher.hash(input.rawToken);
    const session = await deps.uploadSessions.findByTokenHash(tokenHash);
    if (!session) {
      throw new AuthenticationError({ reason: 'upload_token' });
    }
    if (
      session.organizationId !== input.organizationId ||
      session.documentId !== input.documentId
    ) {
      throw new NotFoundError({ resource: 'document' });
    }

    const now = deps.clock.nowUtc();
    if (session.status === 'completed' && session.revisionId) {
      const document = await deps.documents.findById({
        organizationId: session.organizationId,
        documentId: session.documentId,
      });
      if (!document) {
        throw new NotFoundError({ resource: 'document' });
      }
      const revision = await deps.revisions.findById({
        organizationId: session.organizationId,
        revisionId: session.revisionId,
      });
      return toPublicDocument(document, revision);
    }
    if (session.status !== 'issued') {
      throw new ConflictError({ reason: 'upload_session_not_issued', status: session.status });
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new ConflictError({ reason: 'upload_expired' });
    }

    assertedPdfContentType(input.contentType);
    const maxBytes = Number(session.maxBytes);
    assertUploadSize(input.body, Math.min(maxBytes, deps.maxUploadBytes));
    assertPdfMagicBytes(input.body);

    const document = await deps.documents.findById({
      organizationId: session.organizationId,
      documentId: session.documentId,
    });
    if (!document || document.state !== 'draft') {
      throw new ConflictError({ reason: 'document_not_draft' });
    }
    if (document.currentRevisionId !== null) {
      throw new ConflictError({ reason: 'revision_already_present' });
    }

    const sha256Digest = deps.hashing.sha256Hex(input.body);
    const objectKey = sourceRevisionObjectKey(session.organizationId, sha256Digest);
    await deps.storage.putObject({
      organizationId: session.organizationId,
      key: objectKey,
      body: input.body,
      contentType: PDF_CONTENT_TYPE,
      maxBytes: deps.maxUploadBytes,
      expectedSha256Digest: sha256Digest,
    });
    const persistedObject = await deps.storage.getObject({
      organizationId: session.organizationId,
      key: objectKey,
    });
    if (!persistedObject) {
      throw new IntegrityError({
        reason: 'source_missing_after_put',
        code: 'SOURCE_INTEGRITY_FAILURE',
      });
    }
    const persistedDigest = deps.hashing.sha256Hex(persistedObject.body);
    if (
      persistedDigest !== sha256Digest ||
      persistedObject.sha256Digest !== sha256Digest ||
      BigInt(persistedObject.body.byteLength) !== BigInt(input.body.byteLength)
    ) {
      throw new IntegrityError({
        reason: 'source_digest_mismatch_after_put',
        code: 'SOURCE_INTEGRITY_FAILURE',
      });
    }

    const revisionId = deps.ids.next();
    const sizeBytes = BigInt(input.body.byteLength);

    const persisted = await deps.unitOfWork.run(async (scope) => {
      const revision = await scope.revisions.create({
        organizationId: session.organizationId,
        revision: {
          id: revisionId,
          organizationId: session.organizationId,
          documentId: session.documentId,
          kind: 'source',
          objectKey,
          contentType: PDF_CONTENT_TYPE,
          sizeBytes,
          sha256Digest,
          displayName: session.displayName,
          pageCount: extractPdfPageCount(input.body),
          createdAt: now,
        },
      });
      const updated = await scope.documents.attachSourceRevision({
        organizationId: session.organizationId,
        documentId: session.documentId,
        expectedVersion: document.version,
        revisionId,
        sourceDisplayName: session.displayName,
      });
      await scope.uploadSessions.complete({
        organizationId: session.organizationId,
        uploadSessionId: session.id,
        revisionId,
        completedAt: now,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: session.organizationId,
        documentId: session.documentId,
        type: 'revision_added',
        actorType: 'system',
        actorId: 'system',
        occurredAt: now,
        payload: { revisionId, sizeBytes: Number(sizeBytes), sha256Digest },
        requestId: input.requestId,
      });
      await scope.jobs.publish({
        id: deps.ids.next(),
        jobId: deps.ids.next(),
        organizationId: session.organizationId,
        documentId: session.documentId,
        type: INSPECT_DOCUMENT_JOB_TYPE,
        payload: { documentId: session.documentId, revisionId },
        requestId: input.requestId,
        availableAt: now,
      });
      return { updated, revision };
    });

    return toPublicDocument(persisted.updated, persisted.revision);
  };
}

export type CompleteSourceUpload = ReturnType<typeof createCompleteSourceUpload>;
