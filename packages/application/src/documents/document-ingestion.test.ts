import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  type AccountUserActor,
  type Clock,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import {
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createUuidIdGenerator,
} from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createCleanupAbandonedUploads } from './cleanup-abandoned-uploads.js';
import { createCompleteSourceUpload } from './complete-source-upload.js';
import { createCreateDraftDocument } from './create-draft-document.js';
import { createInspectDocument } from './inspect-document.js';
import { createIssueDocumentPreview } from './issue-document-preview.js';
import { createStreamDocumentPreview } from './stream-document-preview.js';
import {
  LOCAL_INSPECTOR_REJECT_MARKER,
  createLocalDevelopmentDocumentInspector,
} from './inspectors.js';
import {
  createMemoryAuditWriter,
  createMemoryDocumentRepository,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryPreviewGrantStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
} from './memory-adapters.js';
import { createSizeLimitedObjectStorage } from './size-limited-storage.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777';
const START = '2026-08-18T12:00:00.000Z';
const MAX_BYTES = 1024;

function nowClock(): Clock & { set: (iso: string) => void } {
  let current = new Date(START);
  return {
    nowUtc: () => new Date(current.getTime()),
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
}

function actor(organizationId = ORG): AccountUserActor {
  return {
    type: 'account_user',
    userId: USER,
    membership: { membershipId: MEMBERSHIP, organizationId, role: 'owner' },
  };
}

function pdfBytes(extra = ''): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${extra}\n%%EOF\n`);
}

function harness() {
  const clock = nowClock();
  const hashing = createSha256Hashing();
  const hasher = createSigningTokenHasher(hashing);
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const documents = createMemoryDocumentRepository();
  const revisions = createMemoryDocumentRevisionRepository();
  const uploadSessions = createMemoryUploadSessionStore();
  const previewGrants = createMemoryPreviewGrantStore();
  const idempotency = createMemoryIdempotencyRecordRepository();
  const audit = createMemoryAuditWriter();
  const jobs = createMemoryJobPublisher();
  const storage = createSizeLimitedObjectStorage(createMemoryObjectStorage(), MAX_BYTES);
  const unitOfWork = createMemoryUnitOfWork(
    createMemoryDocumentScope({
      documents,
      revisions,
      uploadSessions,
      previewGrants,
      idempotencyRecords: idempotency,
      audit,
      jobs,
    }),
  );
  const authorization = createMembershipAuthorizationPolicy();
  const createDraft = createCreateDraftDocument({
    authorization,
    idempotency,
    unitOfWork,
    ids,
    clock,
    hashing,
    tokens,
    hasher,
    maxUploadBytes: MAX_BYTES,
    uploadTtlMs: 60_000,
    idempotencyTtlMs: 3_600_000,
    uploadTokenHeader: 'x-upload-token',
  });
  const completeUpload = createCompleteSourceUpload({
    documents,
    revisions,
    uploadSessions,
    hasher,
    hashing,
    ids,
    clock,
    storage,
    unitOfWork,
    maxUploadBytes: MAX_BYTES,
  });
  const inspect = createInspectDocument({
    documents,
    revisions,
    storage,
    inspector: createLocalDevelopmentDocumentInspector(),
    unitOfWork,
    ids,
    clock,
  });
  const cleanup = createCleanupAbandonedUploads({
    uploadSessions,
    unitOfWork,
    ids,
    clock,
    limit: 50,
  });
  const issuePreview = createIssueDocumentPreview({
    authorization,
    documents,
    revisions,
    previewGrants,
    tokens,
    hasher,
    ids,
    clock,
    previewTtlMs: 120_000,
    previewTokenHeader: 'x-preview-token',
  });
  const streamPreview = createStreamDocumentPreview({
    grants: previewGrants,
    revisions,
    storage,
    hasher,
    clock,
  });
  return {
    clock,
    jobs,
    audit,
    createDraft,
    completeUpload,
    inspect,
    cleanup,
    issuePreview,
    streamPreview,
    hashing,
  };
}

describe('document ingestion', () => {
  it('creates a draft, stores a hashed PDF, and inspects before signing is allowed', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: '../../secret/Contract.PDF',
      idempotencyKey: 'idempotency-key-1',
      requestId: 'req-1',
    });
    expect(created.state).toBe('draft');
    expect(created.inspectionStatus).toBe('pending');
    expect(created.displayName).toBe('Contract.pdf');
    expect(created.availableForSigning).toBe(false);
    expect(created.upload.token).toEqual(expect.any(String));
    expect(JSON.stringify(created)).not.toContain('org/');

    const body = pdfBytes();
    const uploaded = await h.completeUpload({
      organizationId: ORG,
      documentId: created.documentId,
      rawToken: created.upload.token ?? '',
      contentType: 'application/pdf',
      body,
      requestId: 'req-2',
    });
    expect(uploaded.currentRevision?.sha256Digest).toBe(h.hashing.sha256Hex(body));
    expect(uploaded.currentRevision?.sizeBytes).toBe(body.byteLength);
    expect(uploaded.inspectionStatus).toBe('pending');
    expect(uploaded.availableForSigning).toBe(false);
    expect(h.jobs.events).toHaveLength(1);
    expect(h.jobs.events[0]?.type).toBe('inspect_document');
    expect(JSON.stringify(h.jobs.events[0]?.payload)).not.toContain('org/');

    const inspected = await h.inspect({
      organizationId: ORG,
      documentId: created.documentId,
      revisionId: uploaded.currentRevision?.revisionId ?? '',
      jobId: 'job-1',
      requestId: 'req-3',
    });
    expect(inspected.inspectionStatus).toBe('accepted');

    const preview = await h.issuePreview({ actor: actor(), documentId: created.documentId });
    expect(preview.url).toContain('/document-previews/');
    const streamed = await h.streamPreview({
      grantId: preview.url.split('/').pop() ?? '',
      rawToken: preview.token,
    });
    expect(streamed.displayName).toBe('Contract.pdf');
    expect(streamed.body.byteLength).toBe(body.byteLength);
  });

  it('replays create with the same idempotency key without a second token', async () => {
    const h = harness();
    const first = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'same-idempotency-key',
      requestId: 'req-1',
    });
    const second = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'same-idempotency-key',
      requestId: 'req-2',
    });
    expect(second.documentId).toBe(first.documentId);
    expect(second.upload.token).toBeNull();
  });

  it('rejects oversized, malformed, and wrong-magic uploads', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'upload-negatives',
      requestId: 'req-1',
    });
    const token = created.upload.token ?? '';
    await expect(
      h.completeUpload({
        organizationId: ORG,
        documentId: created.documentId,
        rawToken: token,
        contentType: 'application/pdf',
        body: new Uint8Array(MAX_BYTES + 1).fill(0x41),
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      h.completeUpload({
        organizationId: ORG,
        documentId: created.documentId,
        rawToken: token,
        contentType: 'application/pdf',
        body: new TextEncoder().encode('not-a-pdf'),
        requestId: 'req-3',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      h.completeUpload({
        organizationId: ORG,
        documentId: created.documentId,
        rawToken: token,
        contentType: 'text/plain',
        body: pdfBytes(),
        requestId: 'req-4',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('denies an upload token used against another tenant path', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'cross-tenant',
      requestId: 'req-1',
    });
    await expect(
      h.completeUpload({
        organizationId: OTHER,
        documentId: created.documentId,
        rawToken: created.upload.token ?? '',
        contentType: 'application/pdf',
        body: pdfBytes(),
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('abandons expired upload sessions so a late PUT cannot complete', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'abandoned',
      requestId: 'req-1',
    });
    h.clock.set('2026-08-18T12:02:00.000Z');
    const result = await h.cleanup();
    expect(result.abandoned).toBe(1);
    await expect(
      h.completeUpload({
        organizationId: ORG,
        documentId: created.documentId,
        rawToken: created.upload.token ?? '',
        contentType: 'application/pdf',
        body: pdfBytes(),
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(h.audit.events.some((event) => event.type === 'upload_abandoned')).toBe(true);
  });

  it('rejects a local-stub inspect marker and keeps signing unavailable', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'reject-marker',
      requestId: 'req-1',
    });
    const uploaded = await h.completeUpload({
      organizationId: ORG,
      documentId: created.documentId,
      rawToken: created.upload.token ?? '',
      contentType: 'application/pdf',
      body: pdfBytes(LOCAL_INSPECTOR_REJECT_MARKER),
      requestId: 'req-2',
    });
    const inspected = await h.inspect({
      organizationId: ORG,
      documentId: created.documentId,
      revisionId: uploaded.currentRevision?.revisionId ?? '',
      jobId: 'job-reject',
      requestId: 'req-3',
    });
    expect(inspected.inspectionStatus).toBe('rejected');
  });

  it('rejects a missing upload token', async () => {
    const h = harness();
    const created = await h.createDraft({
      actor: actor(),
      title: 'NDA',
      filename: 'a.pdf',
      idempotencyKey: 'missing-token',
      requestId: 'req-1',
    });
    await expect(
      h.completeUpload({
        organizationId: ORG,
        documentId: created.documentId,
        rawToken: 'not-the-token',
        contentType: 'application/pdf',
        body: pdfBytes(),
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
