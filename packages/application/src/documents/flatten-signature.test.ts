import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ExternalServiceError,
  IntegrityError,
  ValidationError,
  artifactObjectKey,
  signatureImageObjectKey,
  sourceRevisionObjectKey,
  type Clock,
  type ConsentRecord,
  type Document,
  type DocumentRevision,
  type ObjectStorage,
  type SignatureField,
  type Signer,
  type SigningSession,
  type UnitOfWork,
} from '@esign/domain';
import { createTestPng } from '@esign/test-utils';
import { createSha256Hashing, createUuidIdGenerator } from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createFlattenSignature } from './flatten-signature.js';
import { createMemoryPdfFlattener } from './memory-pdf-flattener.js';
import {
  createMemoryAuditWriter,
  createMemoryConsentStore,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryFinalizedArtifactStore,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryPreviewGrantStore,
  createMemorySignatureFieldStore,
  createMemorySignerStore,
  createMemorySigningSessionStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
} from './memory-adapters.js';
import { PDF_CONTENT_TYPE } from './pdf.js';
import { PNG_CONTENT_TYPE } from './png.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DOC = '44444444-4444-4444-8444-444444444444';
const REV = '88888888-8888-4888-8888-888888888888';
const SIGNER = '55555555-5555-4555-8555-555555555555';
const SIGNER_B = '55555555-5555-4555-8555-555555555556';
const SESSION = '66666666-6666-4666-8666-666666666666';
const FIELD = '77777777-7777-4777-8777-777777777777';
const CONSENT = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-19T12:00:00.000Z');

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');
}

function nowClock(): Clock {
  return { nowUtc: () => new Date(NOW.getTime()) };
}

async function harness(
  options: {
    pageNumber?: number;
    x?: number;
    width?: number;
    extraSigner?: boolean;
    storage?: ObjectStorage;
    unitOfWork?: (inner: UnitOfWork) => UnitOfWork;
    corruptSource?: boolean;
    png?: Uint8Array;
    documentState?: Document['state'];
  } = {},
) {
  const hashing = createSha256Hashing();
  const source = pdfBytes();
  const png = options.png ?? createTestPng();
  const sourceDigest = hashing.sha256Hex(source);
  const pngDigest = hashing.sha256Hex(png);
  const sourceKey = sourceRevisionObjectKey(ORG, sourceDigest);
  const pngKey = signatureImageObjectKey(ORG, pngDigest);
  const storage = options.storage ?? createMemoryObjectStorage();
  await storage.putObject({
    organizationId: ORG,
    key: sourceKey,
    body: source,
    contentType: PDF_CONTENT_TYPE,
    expectedSha256Digest: sourceDigest,
  });
  await storage.putObject({
    organizationId: ORG,
    key: pngKey,
    body: png,
    contentType: PNG_CONTENT_TYPE,
    expectedSha256Digest: pngDigest,
  });
  if (options.corruptSource === true) {
    const inner = storage;
    const corrupted: ObjectStorage = {
      putObject: (input) => inner.putObject(input),
      deleteObject: (input) => inner.deleteObject(input),
      listKeys: (input) => inner.listKeys(input),
      async getObject(input) {
        const stored = await inner.getObject(input);
        if (!stored || input.key !== sourceKey) {
          return stored;
        }
        const body = Uint8Array.from(stored.body);
        const last = body.length - 1;
        body[last] = (body[last] ?? 0) ^ 0xff;
        return { ...stored, body };
      },
    };
    return buildGraph({
      hashing,
      storage: corrupted,
      source,
      sourceDigest,
      sourceKey,
      pngDigest,
      pngKey,
      pngSize: BigInt(png.byteLength),
      options,
    });
  }
  return buildGraph({
    hashing,
    storage,
    source,
    sourceDigest,
    sourceKey,
    pngDigest,
    pngKey,
    pngSize: BigInt(png.byteLength),
    options,
  });
}

function buildGraph(input: {
  hashing: ReturnType<typeof createSha256Hashing>;
  storage: ObjectStorage;
  source: Uint8Array;
  sourceDigest: string;
  sourceKey: string;
  pngDigest: string;
  pngKey: string;
  pngSize: bigint;
  options: {
    pageNumber?: number;
    x?: number;
    width?: number;
    extraSigner?: boolean;
    unitOfWork?: (inner: UnitOfWork) => UnitOfWork;
    documentState?: Document['state'];
  };
}) {
  const documents = createMemoryDocumentRepository([
    documentRecord(input.options.documentState ?? 'completed'),
  ]);
  const revisions = createMemoryDocumentRevisionRepository([
    revisionRecord(input.source, input.sourceDigest, input.sourceKey),
  ]);
  const signers = createMemorySignerStore([
    signerRecord(SIGNER, 'signed'),
    ...(input.options.extraSigner === true ? [signerRecord(SIGNER_B, 'pending')] : []),
  ]);
  const sessions = createMemorySigningSessionStore([sessionRecord()]);
  const fields = createMemorySignatureFieldStore([
    fieldRecord({
      pageNumber: input.options.pageNumber ?? 1,
      x: input.options.x ?? 0.1,
      width: input.options.width ?? 0.2,
      pngKey: input.pngKey,
      pngDigest: input.pngDigest,
      pngSize: input.pngSize,
    }),
  ]);
  const consent = createMemoryConsentStore([consentRecord()]);
  const artifacts = createMemoryFinalizedArtifactStore();
  const audit = createMemoryAuditWriter();
  const innerUnit = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions,
      uploadSessions: createMemoryUploadSessionStore(),
      previewGrants: createMemoryPreviewGrantStore(),
      idempotencyRecords: createMemoryIdempotencyRecordRepository(),
      audit,
      jobs: createMemoryJobPublisher(),
      signers,
      signatureFields: fields,
      signingSessions: sessions,
      consentRecords: consent,
      finalizedArtifacts: artifacts,
    }),
  );
  const unitOfWork = input.options.unitOfWork ? input.options.unitOfWork(innerUnit) : innerUnit;
  const flatten = createFlattenSignature({
    documents,
    revisions,
    signers,
    sessions,
    fields,
    consent,
    artifacts,
    storage: input.storage,
    flattener: createMemoryPdfFlattener(),
    hashing: input.hashing,
    unitOfWork,
    ids: createUuidIdGenerator(),
    clock: nowClock(),
    leaseMs: 60_000,
    timeoutMs: 5_000,
    maxPdfBytes: 1_048_576,
    maxPngBytes: 256_000,
  });
  return {
    flatten,
    documents,
    revisions,
    fields,
    artifacts,
    audit,
    storage: input.storage,
    hashing: input.hashing,
    sourceDigest: input.sourceDigest,
  };
}

function documentRecord(state: Document['state']): Document {
  return {
    id: DOC,
    organizationId: ORG,
    ownerMembershipId: MEMBERSHIP,
    title: 'NDA',
    state,
    signingMode: 'ordered',
    inspectionStatus: 'accepted',
    sourceDisplayName: 'nda.pdf',
    expiresAt: null,
    currentRevisionId: REV,
    signingRevisionId: REV,
    version: 1,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function revisionRecord(source: Uint8Array, digest: string, key: string): DocumentRevision {
  return {
    id: REV,
    organizationId: ORG,
    documentId: DOC,
    kind: 'source',
    objectKey: key,
    contentType: PDF_CONTENT_TYPE,
    sizeBytes: BigInt(source.byteLength),
    sha256Digest: digest,
    displayName: 'nda.pdf',
    pageCount: 1,
    createdAt: NOW,
  };
}

function signerRecord(id: string, status: Signer['status']): Signer {
  return {
    id,
    organizationId: ORG,
    documentId: DOC,
    accountUserId: null,
    routingOrder: id === SIGNER ? 1 : 2,
    status,
    email: null,
    displayName: 'Alex Signer',
    version: 1,
    completedAt: status === 'signed' ? NOW : null,
    declinedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function sessionRecord(): SigningSession {
  return {
    id: SESSION,
    organizationId: ORG,
    documentId: DOC,
    signerId: SIGNER,
    tokenHash: 'a'.repeat(64),
    csrfTokenHash: 'b'.repeat(64),
    status: 'completed',
    expiresAt: NOW,
    consumedAt: NOW,
    completedAt: NOW,
    revokedAt: null,
    presentationAttemptCount: 1,
    failedPresentationCount: 0,
    lastPresentedAt: NOW,
    requestId: 'req-sign',
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fieldRecord(input: {
  pageNumber: number;
  x: number;
  width: number;
  pngKey: string;
  pngDigest: string;
  pngSize: bigint;
}): SignatureField {
  return {
    id: FIELD,
    organizationId: ORG,
    documentId: DOC,
    signerId: SIGNER,
    type: 'signature',
    pageNumber: input.pageNumber,
    x: input.x,
    y: 0.1,
    width: input.width,
    height: 0.1,
    required: true,
    completedAt: NOW,
    completionObjectKey: input.pngKey,
    completionContentType: PNG_CONTENT_TYPE,
    completionSizeBytes: input.pngSize,
    completionSha256Digest: input.pngDigest,
    flattenedRevisionId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function consentRecord(): ConsentRecord {
  return {
    id: CONSENT,
    organizationId: ORG,
    documentId: DOC,
    signerId: SIGNER,
    sessionId: SESSION,
    consentCopyId: 'esign-disclosure-v1',
    acceptedAt: NOW,
    requestId: 'req-consent',
    untrustedClientIp: '203.0.113.9',
    untrustedUserAgent: 'vitest',
    createdAt: NOW,
  };
}

const jobInput = {
  organizationId: ORG,
  documentId: DOC,
  signerId: SIGNER,
  sessionId: SESSION,
  revisionId: REV,
  jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  outboxEventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  owner: 'worker-a',
};

describe('flatten signature', () => {
  it('uploads a content-addressed artifact and verifies the stored hash byte-for-byte', async () => {
    const h = await harness();
    const result = await h.flatten(jobInput);
    expect(result.status).toBe('finalized');
    expect(result.sha256Digest).toBe(h.sourceDigest);
    const key = artifactObjectKey(ORG, h.sourceDigest);
    const stored = await h.storage.getObject({ organizationId: ORG, key });
    expect(stored).not.toBeNull();
    expect(h.hashing.sha256Hex(stored?.body ?? new Uint8Array())).toBe(h.sourceDigest);
    expect(stored?.sha256Digest).toBe(h.sourceDigest);
    expect(h.documents.records[0]?.state).toBe('finalized');
    expect(h.audit.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['finalization_started', 'revision_added', 'document_finalized']),
    );
    const finalized = h.audit.events.find((event) => event.type === 'document_finalized');
    expect(finalized?.payload).toMatchObject({
      documentId: DOC,
      signerId: SIGNER,
      signingSessionId: SESSION,
      correlationId: jobInput.requestId,
      sourceSha256: h.sourceDigest,
      finalizedSha256: h.sourceDigest,
      signatureFieldId: FIELD,
      consentVersion: 'esign-disclosure-v1',
    });
    expect(JSON.stringify(finalized?.payload)).not.toContain('%PDF');
  });

  it('rejects a corrupted source object', async () => {
    const h = await harness({ corruptSource: true });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(IntegrityError);
    expect(h.documents.records[0]?.state).toBe('finalization_failed');
  });

  it('rejects a malformed PNG', async () => {
    const h = await harness({ png: new TextEncoder().encode('not-a-png') });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an invalid page index', async () => {
    const h = await harness({ pageNumber: 9 });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an out-of-bounds field rectangle', async () => {
    const h = await harness({ x: 0.9, width: 0.3 });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns the same artifact for a duplicate job', async () => {
    const h = await harness();
    const first = await h.flatten(jobInput);
    const second = await h.flatten({ ...jobInput, owner: 'worker-retry' });
    expect(first.sha256Digest).toBe(second.sha256Digest);
    expect(second.status).toBe('noop');
    expect(h.artifacts.records).toHaveLength(1);
  });

  it('prevents concurrent workers from committing conflicting revisions', async () => {
    const h = await harness();
    const results = await Promise.allSettled([
      h.flatten(jobInput),
      h.flatten({ ...jobInput, owner: 'worker-b' }),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ status: string; sha256Digest: string | null }> =>
        result.status === 'fulfilled',
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(h.artifacts.records).toHaveLength(1);
    expect(new Set(h.artifacts.records.map((row) => row.sha256Digest)).size).toBe(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    for (const result of rejected) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ConflictError);
      }
    }
  });

  it('retries after a storage failure using the same content-addressed key', async () => {
    const inner = createMemoryObjectStorage();
    let revisionPuts = 0;
    const storage: ObjectStorage = {
      async putObject(input) {
        if (input.key.includes('/revisions/')) {
          revisionPuts += 1;
          if (revisionPuts === 2) {
            throw new Error('storage down');
          }
        }
        return inner.putObject(input);
      },
      getObject: (input) => inner.getObject(input),
      deleteObject: (input) => inner.deleteObject(input),
      listKeys: (input) => inner.listKeys(input),
    };
    const h = await harness({ storage });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(ExternalServiceError);
    const retry = await h.flatten({ ...jobInput, owner: 'worker-retry' });
    expect(retry.status).toBe('finalized');
    expect(retry.sha256Digest).toBe(h.sourceDigest);
  });

  it('retries after a database commit failure without creating a second artifact', async () => {
    let calls = 0;
    const h = await harness({
      unitOfWork: (inner) => ({
        async run(work) {
          calls += 1;
          if (calls === 2) {
            throw new Error('db down');
          }
          return inner.run(work);
        },
      }),
    });
    await expect(h.flatten(jobInput)).rejects.toBeInstanceOf(ExternalServiceError);
    const retry = await h.flatten({ ...jobInput, owner: 'worker-retry' });
    expect(retry.status).toBe('finalized');
    expect(h.artifacts.records).toHaveLength(1);
  });

  it('creates an intermediate revision when other signers remain', async () => {
    const h = await harness({ extraSigner: true, documentState: 'in_progress' });
    const result = await h.flatten(jobInput);
    expect(result.status).toBe('revised');
    expect(h.documents.records[0]?.state).toBe('in_progress');
    expect(h.artifacts.records).toHaveLength(0);
    expect(h.fields.records[0]?.flattenedRevisionId).not.toBeNull();
    expect(h.revisions.records.length).toBeGreaterThan(1);
  });
});
