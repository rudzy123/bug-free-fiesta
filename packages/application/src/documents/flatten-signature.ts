import {
  assertFieldOnPage,
  assertTenantObjectKey,
  artifactObjectKey,
  classifyJobFailure,
  ConflictError,
  finalizationError,
  isApplicationError,
  FLATTEN_SIGNATURE_JOB_TYPE,
  sourceRevisionObjectKey,
  type Clock,
  type ConsentRecordRepository,
  type Document,
  type DocumentRepository,
  type DocumentRevision,
  type DocumentRevisionRepository,
  type FinalizedArtifactRepository,
  type Hashing,
  type IdGenerator,
  type ObjectStorage,
  type PdfFlattener,
  type SignatureField,
  type SignatureFieldRepository,
  type SignerRepository,
  type SigningSessionRepository,
  type UnitOfWork,
} from '@esign/domain';
import { PDF_CONTENT_TYPE, assertPdfMagicBytes } from './pdf.js';
import { validateSignaturePng } from './png.js';
import { withTimeout } from '../jobs/with-timeout.js';

export type FlattenSignatureInput = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly revisionId: string;
  readonly jobId: string;
  readonly outboxEventId: string;
  readonly requestId: string | null;
  readonly owner: string;
};

export function createFlattenSignature(deps: {
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  signers: SignerRepository;
  sessions: SigningSessionRepository;
  fields: SignatureFieldRepository;
  consent: ConsentRecordRepository;
  artifacts: FinalizedArtifactRepository;
  storage: ObjectStorage;
  flattener: PdfFlattener;
  hashing: Hashing;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  leaseMs: number;
  timeoutMs: number;
  maxPdfBytes: number;
  maxPngBytes: number;
}) {
  return async function flattenSignature(input: FlattenSignatureInput): Promise<{
    status: 'finalized' | 'revised' | 'noop';
    sha256Digest: string | null;
  }> {
    const loaded = await loadAuthorizedWork(deps, input);
    if (loaded.kind === 'noop') {
      return { status: 'noop', sha256Digest: loaded.artifactDigest };
    }

    if (loaded.document.state === 'finalized') {
      return persistMissingFinalArtifact(deps, input, loaded);
    }

    const now = deps.clock.nowUtc();
    let leased;
    try {
      leased = await deps.documents.claimProcessingLease({
        organizationId: input.organizationId,
        documentId: input.documentId,
        expectedVersion: loaded.document.version,
        owner: input.owner,
        leaseUntil: new Date(now.getTime() + deps.leaseMs),
        now,
      });
    } catch (error: unknown) {
      if (error instanceof ConflictError && error.details.reason === 'document_lease') {
        throw finalizationError('CONCURRENT_FINALIZATION');
      }
      throw error;
    }

    if (leased.state === 'finalizing') {
      await deps.unitOfWork.run(async (scope) => {
        await scope.audit.append({
          id: deps.ids.next(),
          organizationId: input.organizationId,
          documentId: input.documentId,
          type: 'finalization_started',
          actorType: 'worker',
          actorId: input.jobId,
          occurredAt: now,
          payload: {
            signerId: input.signerId,
            sessionId: input.sessionId,
            jobType: FLATTEN_SIGNATURE_JOB_TYPE,
            outboxEventId: input.outboxEventId,
          },
          requestId: input.requestId,
        });
      });
    }

    try {
      const currentRevisionId = leased.currentRevisionId ?? loaded.revision.id;
      const revision = await deps.revisions.findById({
        organizationId: input.organizationId,
        revisionId: currentRevisionId,
      });
      if (!revision) {
        throw finalizationError('SOURCE_OBJECT_NOT_FOUND', { resource: 'revision' });
      }

      const pendingFields = loaded.signerFields.filter(
        (field) => field.flattenedRevisionId === null,
      );
      let output = {
        bytes: new Uint8Array(),
        digest: revision.sha256Digest,
        pageCount: revision.pageCount,
        objectKey: revision.objectKey,
      };

      if (pendingFields.length > 0) {
        output = await flattenOntoRevision({
          deps,
          input,
          document: leased,
          revision,
          signerFields: pendingFields,
          signerName: loaded.signerName,
          signedAt: loaded.signedAt,
        });
      } else {
        const stored = await downloadAndVerifySource(deps, revision);
        output = {
          bytes: stored.body,
          digest: stored.sha256Digest,
          pageCount: revision.pageCount,
          objectKey: revision.objectKey,
        };
      }

      const finalize = loaded.allSignersComplete;
      const revisionId = pendingFields.length > 0 ? deps.ids.next() : revision.id;
      const artifactId = deps.ids.next();
      const occurredAt = deps.clock.nowUtc();

      if (finalize && output.objectKey !== artifactObjectKey(input.organizationId, output.digest)) {
        const artifactKey = artifactObjectKey(input.organizationId, output.digest);
        await putVerifiedObject(deps, {
          organizationId: input.organizationId,
          key: artifactKey,
          body: output.bytes,
          digest: output.digest,
        });
      }

      try {
        await deps.unitOfWork.run(async (scope) => {
          if (pendingFields.length > 0) {
            await scope.revisions.create({
              organizationId: input.organizationId,
              revision: {
                id: revisionId,
                organizationId: input.organizationId,
                documentId: input.documentId,
                kind: 'intermediate',
                objectKey: output.objectKey,
                contentType: PDF_CONTENT_TYPE,
                sizeBytes: BigInt(output.bytes.byteLength),
                sha256Digest: output.digest,
                displayName: revision.displayName,
                pageCount: output.pageCount,
                createdAt: occurredAt,
              },
            });
            for (const field of pendingFields) {
              await scope.signatureFields.markFlattened({
                organizationId: input.organizationId,
                fieldId: field.id,
                flattenedRevisionId: revisionId,
              });
            }
            await scope.audit.append({
              id: deps.ids.next(),
              organizationId: input.organizationId,
              documentId: input.documentId,
              type: 'revision_added',
              actorType: 'worker',
              actorId: input.jobId,
              occurredAt,
              payload: {
                revisionId,
                sha256Digest: output.digest,
                signerId: input.signerId,
                outboxEventId: input.outboxEventId,
              },
              requestId: input.requestId,
            });
          }
          await scope.documents.commitFlattenedRevision({
            organizationId: input.organizationId,
            documentId: input.documentId,
            expectedVersion: leased.version,
            owner: input.owner,
            revisionId,
            finalize,
          });
          if (finalize) {
            const existing = await scope.finalizedArtifacts.findByDocument({
              organizationId: input.organizationId,
              documentId: input.documentId,
            });
            if (!existing) {
              await scope.finalizedArtifacts.create({
                organizationId: input.organizationId,
                artifact: {
                  id: artifactId,
                  organizationId: input.organizationId,
                  documentId: input.documentId,
                  objectKey: artifactObjectKey(input.organizationId, output.digest),
                  contentType: PDF_CONTENT_TYPE,
                  sizeBytes: BigInt(output.bytes.byteLength),
                  sha256Digest: output.digest,
                  createdAt: occurredAt,
                },
              });
            }
            await scope.audit.append({
              id: deps.ids.next(),
              organizationId: input.organizationId,
              documentId: input.documentId,
              type: 'document_finalized',
              actorType: 'worker',
              actorId: input.jobId,
              occurredAt,
              payload: buildFinalizedAuditPayload({
                input,
                loaded,
                sourceDigest: revision.sha256Digest,
                finalizedDigest: output.digest,
                occurredAt,
              }),
              requestId: input.requestId,
            });
          }
        });
      } catch (error: unknown) {
        if (error instanceof ConflictError) {
          throw finalizationError('CONCURRENT_FINALIZATION');
        }
        if (isApplicationError(error) && error.kind !== 'external_service') {
          throw error;
        }
        throw finalizationError('DATABASE_COMMIT_FAILED', {
          cause: error instanceof Error ? error.name : 'unknown',
        });
      }

      return {
        status: finalize ? 'finalized' : 'revised',
        sha256Digest: output.digest,
      };
    } catch (error: unknown) {
      const classified = classifyJobFailure(error);
      if (!classified.retryable) {
        await deps.documents.markFinalizationFailed({
          organizationId: input.organizationId,
          documentId: input.documentId,
          owner: input.owner,
        });
        await deps.unitOfWork.run(async (scope) => {
          await scope.audit.append({
            id: deps.ids.next(),
            organizationId: input.organizationId,
            documentId: input.documentId,
            type: 'finalization_failed',
            actorType: 'worker',
            actorId: input.jobId,
            occurredAt: deps.clock.nowUtc(),
            payload: {
              signerId: input.signerId,
              sessionId: input.sessionId,
              code: classified.code,
              outboxEventId: input.outboxEventId,
            },
            requestId: input.requestId,
          });
        });
      } else {
        await deps.documents.releaseProcessingLease({
          organizationId: input.organizationId,
          documentId: input.documentId,
          owner: input.owner,
        });
      }
      throw error;
    }
  };
}

export type FlattenSignature = ReturnType<typeof createFlattenSignature>;

async function loadAuthorizedWork(
  deps: Parameters<typeof createFlattenSignature>[0],
  input: FlattenSignatureInput,
): Promise<
  | { kind: 'noop'; artifactDigest: string | null }
  | {
      kind: 'work';
      document: Document;
      revision: DocumentRevision;
      signerFields: SignatureField[];
      signerName: string;
      signedAt: Date;
      allSignersComplete: boolean;
      consentCopyId: string;
      consentAcceptedAt: Date;
      untrustedClientIp: string | null;
      untrustedUserAgent: string | null;
      signaturePngDigest: string | null;
      signatureFieldId: string | null;
    }
> {
  const document = await deps.documents.findById({
    organizationId: input.organizationId,
    documentId: input.documentId,
  });
  if (!document) {
    throw finalizationError('INVALID_SIGNATURE_FIELD', { resource: 'document' });
  }
  const artifact = await deps.artifacts.findByDocument({
    organizationId: input.organizationId,
    documentId: input.documentId,
  });
  if (document.state === 'finalized' && artifact) {
    return { kind: 'noop', artifactDigest: artifact.sha256Digest };
  }

  const signer = await deps.signers.findById({
    organizationId: input.organizationId,
    signerId: input.signerId,
  });
  if (!signer || signer.documentId !== document.id) {
    throw finalizationError('INVALID_SIGNATURE_FIELD', { resource: 'signer' });
  }
  const session = await deps.sessions.findById({
    organizationId: input.organizationId,
    sessionId: input.sessionId,
  });
  if (!session || session.documentId !== document.id || session.signerId !== signer.id) {
    throw finalizationError('INVALID_SIGNATURE_FIELD', { resource: 'session' });
  }
  const consent = await deps.consent.findBySession({
    organizationId: input.organizationId,
    sessionId: session.id,
  });
  if (!consent) {
    throw finalizationError('INVALID_SIGNATURE_FIELD', { resource: 'consent' });
  }
  const revisionId = document.currentRevisionId ?? input.revisionId;
  const revision = await deps.revisions.findById({
    organizationId: input.organizationId,
    revisionId,
  });
  if (!revision || revision.documentId !== document.id) {
    throw finalizationError('SOURCE_OBJECT_NOT_FOUND', { resource: 'revision' });
  }
  const signers = await deps.signers.listByDocument({
    organizationId: input.organizationId,
    documentId: document.id,
  });
  const fields = await deps.fields.listByDocument({
    organizationId: input.organizationId,
    documentId: document.id,
  });
  const signerFields = fields.filter((field) => field.signerId === signer.id);
  if (signerFields.length === 0) {
    throw finalizationError('INVALID_SIGNATURE_FIELD', { reason: 'missing_fields' });
  }
  const signatureField = signerFields.find((field) => field.type === 'signature') ?? null;
  return {
    kind: 'work',
    document,
    revision,
    signerFields,
    signerName: signer.displayName,
    signedAt: signer.completedAt ?? deps.clock.nowUtc(),
    allSignersComplete: signers.every((row) => row.status === 'signed'),
    consentCopyId: consent.consentCopyId,
    consentAcceptedAt: consent.acceptedAt,
    untrustedClientIp: consent.untrustedClientIp,
    untrustedUserAgent: consent.untrustedUserAgent,
    signaturePngDigest: signatureField?.completionSha256Digest ?? null,
    signatureFieldId: signatureField?.id ?? null,
  };
}

async function flattenOntoRevision(input: {
  deps: Parameters<typeof createFlattenSignature>[0];
  input: FlattenSignatureInput;
  document: Document;
  revision: DocumentRevision;
  signerFields: SignatureField[];
  signerName: string;
  signedAt: Date;
}): Promise<{ bytes: Uint8Array; digest: string; pageCount: number; objectKey: string }> {
  const { deps, revision, signerFields } = input;
  const source = await downloadAndVerifySource(deps, revision);
  const appearances = [];
  for (const field of signerFields) {
    if (field.documentId !== input.document.id || field.signerId !== input.input.signerId) {
      throw finalizationError('INVALID_SIGNATURE_FIELD', { fieldId: field.id });
    }
    try {
      assertFieldOnPage({ field, pageCount: revision.pageCount });
    } catch {
      throw finalizationError('INVALID_SIGNATURE_FIELD', {
        fieldId: field.id,
        reason: 'page_or_rectangle',
      });
    }
    let pngBytes: Uint8Array | null = null;
    if (field.type === 'signature' || field.type === 'initials') {
      if (field.completionObjectKey === null) {
        throw finalizationError('INVALID_SIGNATURE_IMAGE', { fieldId: field.id });
      }
      const stored = await deps.storage.getObject({
        organizationId: input.input.organizationId,
        key: assertTenantObjectKey(input.input.organizationId, field.completionObjectKey),
      });
      if (!stored) {
        throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'missing_png' });
      }
      if (
        field.completionSizeBytes !== null &&
        BigInt(stored.body.byteLength) !== field.completionSizeBytes
      ) {
        throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_size' });
      }
      const digest = deps.hashing.sha256Hex(stored.body);
      if (field.completionSha256Digest !== null && digest !== field.completionSha256Digest) {
        throw finalizationError('INVALID_SIGNATURE_IMAGE', { reason: 'png_digest' });
      }
      validateSignaturePng(stored.body, deps.maxPngBytes);
      pngBytes = stored.body;
    }
    appearances.push({
      field,
      pngBytes,
      signerName: field.type === 'signer_name' ? input.signerName : null,
      signedAt: field.type === 'date_signed' ? input.signedAt : null,
    });
  }

  let flattened;
  try {
    flattened = await withTimeout(
      deps.flattener.flatten({
        pdfBytes: source.body,
        appearances,
        occurredAt: input.signedAt,
        timeoutMs: deps.timeoutMs,
      }),
      deps.timeoutMs,
      () => finalizationError('PDF_GENERATION_FAILED', { reason: 'timeout' }),
    );
  } catch (error: unknown) {
    if (isApplicationError(error)) {
      throw error;
    }
    throw finalizationError('PDF_GENERATION_FAILED', {
      cause: error instanceof Error ? error.name : 'unknown',
    });
  }

  const digest = deps.hashing.sha256Hex(flattened.pdfBytes);
  const objectKey = sourceRevisionObjectKey(input.input.organizationId, digest);
  await putVerifiedObject(deps, {
    organizationId: input.input.organizationId,
    key: objectKey,
    body: flattened.pdfBytes,
    digest,
  });
  return {
    bytes: flattened.pdfBytes,
    digest,
    pageCount: flattened.pageCount,
    objectKey,
  };
}

async function downloadAndVerifySource(
  deps: Parameters<typeof createFlattenSignature>[0],
  revision: DocumentRevision,
): Promise<{ body: Uint8Array; sha256Digest: string }> {
  const stored = await deps.storage.getObject({
    organizationId: revision.organizationId,
    key: assertTenantObjectKey(revision.organizationId, revision.objectKey),
  });
  if (!stored) {
    throw finalizationError('SOURCE_OBJECT_NOT_FOUND');
  }
  if (BigInt(stored.body.byteLength) !== revision.sizeBytes) {
    throw finalizationError('SOURCE_INTEGRITY_FAILURE', { reason: 'size' });
  }
  const digest = deps.hashing.sha256Hex(stored.body);
  if (digest !== revision.sha256Digest || digest !== stored.sha256Digest) {
    throw finalizationError('SOURCE_INTEGRITY_FAILURE', { reason: 'digest' });
  }
  if (stored.body.byteLength > deps.maxPdfBytes) {
    throw finalizationError('INVALID_PDF', { reason: 'too_large' });
  }
  try {
    assertPdfMagicBytes(stored.body);
  } catch {
    throw finalizationError('INVALID_PDF', { reason: 'pdf_magic' });
  }
  return { body: stored.body, sha256Digest: digest };
}

async function putVerifiedObject(
  deps: Parameters<typeof createFlattenSignature>[0],
  input: { organizationId: string; key: string; body: Uint8Array; digest: string },
): Promise<void> {
  try {
    await deps.storage.putObject({
      organizationId: input.organizationId,
      key: input.key,
      body: input.body,
      contentType: PDF_CONTENT_TYPE,
      maxBytes: deps.maxPdfBytes,
      expectedSha256Digest: input.digest,
    });
  } catch (error: unknown) {
    if (isApplicationError(error)) {
      throw error;
    }
    throw finalizationError('FINAL_OBJECT_UPLOAD_FAILED', {
      cause: error instanceof Error ? error.name : 'unknown',
    });
  }
  const persisted = await deps.storage.getObject({
    organizationId: input.organizationId,
    key: input.key,
  });
  if (!persisted) {
    throw finalizationError('FINAL_OBJECT_INTEGRITY_FAILURE', { reason: 'missing_after_put' });
  }
  const digest = deps.hashing.sha256Hex(persisted.body);
  if (digest !== input.digest || persisted.sha256Digest !== input.digest) {
    throw finalizationError('FINAL_OBJECT_INTEGRITY_FAILURE', { reason: 'digest_mismatch' });
  }
}

async function persistMissingFinalArtifact(
  deps: Parameters<typeof createFlattenSignature>[0],
  input: FlattenSignatureInput,
  loaded: Extract<Awaited<ReturnType<typeof loadAuthorizedWork>>, { kind: 'work' }>,
): Promise<{ status: 'finalized'; sha256Digest: string }> {
  const source = await downloadAndVerifySource(deps, loaded.revision);
  const artifactKey = artifactObjectKey(input.organizationId, source.sha256Digest);
  if (loaded.revision.objectKey !== artifactKey) {
    await putVerifiedObject(deps, {
      organizationId: input.organizationId,
      key: artifactKey,
      body: source.body,
      digest: source.sha256Digest,
    });
  }
  const occurredAt = deps.clock.nowUtc();
  try {
    await deps.unitOfWork.run(async (scope) => {
      const existing = await scope.finalizedArtifacts.findByDocument({
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
      if (existing) {
        return;
      }
      await scope.finalizedArtifacts.create({
        organizationId: input.organizationId,
        artifact: {
          id: deps.ids.next(),
          organizationId: input.organizationId,
          documentId: input.documentId,
          objectKey: artifactKey,
          contentType: PDF_CONTENT_TYPE,
          sizeBytes: BigInt(source.body.byteLength),
          sha256Digest: source.sha256Digest,
          createdAt: occurredAt,
        },
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: input.organizationId,
        documentId: input.documentId,
        type: 'document_finalized',
        actorType: 'worker',
        actorId: input.jobId,
        occurredAt,
        payload: buildFinalizedAuditPayload({
          input,
          loaded,
          sourceDigest: loaded.revision.sha256Digest,
          finalizedDigest: source.sha256Digest,
          occurredAt,
        }),
        requestId: input.requestId,
      });
    });
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      throw finalizationError('CONCURRENT_FINALIZATION');
    }
    if (isApplicationError(error) && error.kind !== 'external_service') {
      throw error;
    }
    throw finalizationError('DATABASE_COMMIT_FAILED', {
      cause: error instanceof Error ? error.name : 'unknown',
    });
  }
  return { status: 'finalized', sha256Digest: source.sha256Digest };
}

function buildFinalizedAuditPayload(input: {
  input: FlattenSignatureInput;
  loaded: Extract<Awaited<ReturnType<typeof loadAuthorizedWork>>, { kind: 'work' }>;
  sourceDigest: string;
  finalizedDigest: string;
  occurredAt: Date;
}): Readonly<Record<string, unknown>> {
  return {
    documentId: input.input.documentId,
    signerId: input.input.signerId,
    signingSessionId: input.input.sessionId,
    correlationId: input.input.requestId,
    eventType: 'document_finalized',
    occurredAt: input.occurredAt.toISOString(),
    untrustedClientIp: input.loaded.untrustedClientIp,
    untrustedUserAgent: input.loaded.untrustedUserAgent,
    sourceSha256: input.sourceDigest,
    finalizedSha256: input.finalizedDigest,
    signaturePngSha256: input.loaded.signaturePngDigest,
    consentVersion: input.loaded.consentCopyId,
    intentAcceptedAt: input.loaded.consentAcceptedAt.toISOString(),
    signatureFieldId: input.loaded.signatureFieldId,
    jobId: input.input.jobId,
    outboxEventId: input.input.outboxEventId,
  };
}
