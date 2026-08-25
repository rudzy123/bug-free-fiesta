import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  ConflictError,
  IntegrityError,
  NotFoundError,
  artifactObjectKey,
  type AccountUserActor,
  type Clock,
  type Document,
  type FinalizedArtifact,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createSha256Hashing, createUuidIdGenerator } from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createDownloadFinalizedArtifact } from './download-finalized-artifact.js';
import {
  createMemoryAuditWriter,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryFinalizedArtifactStore,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryPreviewGrantStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
} from './memory-adapters.js';
import { PDF_CONTENT_TYPE } from './pdf.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777';
const DOC = '44444444-4444-4444-8444-444444444444';
const ARTIFACT = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-08-25T12:00:00.000Z');

function actor(
  organizationId = ORG,
  role: AccountUserActor['membership']['role'] = 'owner',
): AccountUserActor {
  return {
    type: 'account_user',
    userId: USER,
    membership: { membershipId: MEMBERSHIP, organizationId, role },
  };
}

function nowClock(): Clock {
  return { nowUtc: () => new Date(NOW.getTime()) };
}

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');
}

function documentRecord(state: Document['state'] = 'finalized'): Document {
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
    currentRevisionId: null,
    signingRevisionId: null,
    version: 4,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function harness(
  options: { state?: Document['state']; corruptStored?: boolean; omitArtifact?: boolean } = {},
) {
  const hashing = createSha256Hashing();
  const body = pdfBytes();
  const digest = hashing.sha256Hex(body);
  const key = artifactObjectKey(ORG, digest);
  const innerStorage = createMemoryObjectStorage();
  await innerStorage.putObject({
    organizationId: ORG,
    key,
    body,
    contentType: PDF_CONTENT_TYPE,
    expectedSha256Digest: digest,
  });
  const storage =
    options.corruptStored === true
      ? {
          putObject: (input: Parameters<typeof innerStorage.putObject>[0]) =>
            innerStorage.putObject(input),
          deleteObject: (input: Parameters<typeof innerStorage.deleteObject>[0]) =>
            innerStorage.deleteObject(input),
          listKeys: (input: Parameters<typeof innerStorage.listKeys>[0]) =>
            innerStorage.listKeys(input),
          async getObject(input: Parameters<typeof innerStorage.getObject>[0]) {
            const stored = await innerStorage.getObject(input);
            if (!stored) {
              return stored;
            }
            const copy = Uint8Array.from(stored.body);
            const last = copy.length - 1;
            copy[last] = (copy[last] ?? 0) ^ 0xff;
            return { ...stored, body: copy };
          },
        }
      : innerStorage;
  const documents = createMemoryDocumentRepository([documentRecord(options.state)]);
  const artifact: FinalizedArtifact = {
    id: ARTIFACT,
    organizationId: ORG,
    documentId: DOC,
    objectKey: key,
    contentType: PDF_CONTENT_TYPE,
    sizeBytes: BigInt(body.byteLength),
    sha256Digest: digest,
    createdAt: NOW,
  };
  const artifacts = createMemoryFinalizedArtifactStore(
    options.omitArtifact === true ? [] : [artifact],
  );
  const audit = createMemoryAuditWriter();
  const unitOfWork = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions: createMemoryDocumentRevisionRepository(),
      uploadSessions: createMemoryUploadSessionStore(),
      previewGrants: createMemoryPreviewGrantStore(),
      idempotencyRecords: createMemoryIdempotencyRecordRepository(),
      audit,
      jobs: createMemoryJobPublisher(),
      finalizedArtifacts: artifacts,
    }),
  );
  const download = createDownloadFinalizedArtifact({
    authorization: createMembershipAuthorizationPolicy(),
    documents,
    artifacts,
    storage,
    hashing,
    unitOfWork,
    ids: createUuidIdGenerator(),
    clock: nowClock(),
  });
  return { download, audit, digest, body };
}

describe('downloadFinalizedArtifact', () => {
  it('returns verified bytes and appends an audit event', async () => {
    const h = await harness();
    const result = await h.download({
      actor: actor(),
      documentId: DOC,
      requestId: 'req-dl-1',
    });
    expect(result.sha256Digest).toBe(h.digest);
    expect(Array.from(result.body)).toEqual(Array.from(h.body));
    expect(result.displayName).toBe('nda.pdf');
    expect(h.audit.events.map((event) => event.type)).toContain('artifact_downloaded');
    expect(JSON.stringify(h.audit.events)).not.toContain('%PDF');
  });

  it('rejects download before the document is finalized', async () => {
    const h = await harness({ state: 'completed' });
    await expect(
      h.download({ actor: actor(), documentId: DOC, requestId: 'req-dl-2' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a missing artifact', async () => {
    const h = await harness({ omitArtifact: true });
    await expect(
      h.download({ actor: actor(), documentId: DOC, requestId: 'req-dl-3' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to return bytes when the stored digest does not match', async () => {
    const h = await harness({ corruptStored: true });
    await expect(
      h.download({ actor: actor(), documentId: DOC, requestId: 'req-dl-4' }),
    ).rejects.toBeInstanceOf(IntegrityError);
    expect(h.audit.events).toHaveLength(0);
  });

  it('denies a member from downloading', async () => {
    const h = await harness();
    await expect(
      h.download({ actor: actor(ORG, 'member'), documentId: DOC, requestId: 'req-dl-5' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('does not download another organization artifact', async () => {
    const h = await harness();
    await expect(
      h.download({ actor: actor(OTHER), documentId: DOC, requestId: 'req-dl-6' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
