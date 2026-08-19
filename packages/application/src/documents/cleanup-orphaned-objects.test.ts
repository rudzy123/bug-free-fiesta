import { describe, expect, it } from 'vitest';
import { sourceRevisionObjectKey } from '@esign/domain';
import { createSha256Hashing } from '../ports/node-crypto.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createCleanupOrphanedObjects } from './cleanup-orphaned-objects.js';
import {
  createMemoryAuditWriter,
  createMemoryDocumentRevisionRepository,
  createMemoryDocumentScope,
  createMemoryFinalizedArtifactStore,
  createMemoryIdempotencyRecordRepository,
  createMemoryJobPublisher,
  createMemoryPreviewGrantStore,
  createMemorySignatureFieldStore,
  createMemoryUnitOfWork,
  createMemoryUploadSessionStore,
} from './memory-adapters.js';
import { createMemoryDocumentRepository } from './memory-adapters.js';
import { PDF_CONTENT_TYPE } from './pdf.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-19T12:00:00.000Z');

describe('orphaned object cleanup', () => {
  it('deletes unreferenced objects older than the TTL and keeps referenced revisions', async () => {
    const hashing = createSha256Hashing();
    const clock = { nowUtc: () => new Date(NOW.getTime()) };
    const storage = createMemoryObjectStorage({
      clock: () => new Date('2026-08-18T12:00:00.000Z'),
    });
    const body = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');
    const digest = hashing.sha256Hex(body);
    const referencedKey = sourceRevisionObjectKey(ORG, digest);
    const orphanDigest = hashing.sha256Hex(new TextEncoder().encode('%PDF-orphan\n'));
    const orphanKey = sourceRevisionObjectKey(ORG, orphanDigest);
    await storage.putObject({
      organizationId: ORG,
      key: referencedKey,
      body,
      contentType: PDF_CONTENT_TYPE,
      expectedSha256Digest: digest,
    });
    await storage.putObject({
      organizationId: ORG,
      key: orphanKey,
      body: new TextEncoder().encode('%PDF-orphan\n'),
      contentType: PDF_CONTENT_TYPE,
      expectedSha256Digest: orphanDigest,
    });
    const revisions = createMemoryDocumentRevisionRepository([
      {
        id: '88888888-8888-4888-8888-888888888888',
        organizationId: ORG,
        documentId: '44444444-4444-4444-8444-444444444444',
        kind: 'source',
        objectKey: referencedKey,
        contentType: PDF_CONTENT_TYPE,
        sizeBytes: BigInt(body.byteLength),
        sha256Digest: digest,
        displayName: 'nda.pdf',
        pageCount: 1,
        createdAt: NOW,
      },
    ]);
    const cleanup = createCleanupOrphanedObjects({
      storage,
      unitOfWork: createMemoryUnitOfWork(
        createMemoryDocumentScope({
          documents: createMemoryDocumentRepository(),
          revisions,
          uploadSessions: createMemoryUploadSessionStore(),
          previewGrants: createMemoryPreviewGrantStore(),
          idempotencyRecords: createMemoryIdempotencyRecordRepository(),
          audit: createMemoryAuditWriter(),
          jobs: createMemoryJobPublisher(),
          signatureFields: createMemorySignatureFieldStore(),
          finalizedArtifacts: createMemoryFinalizedArtifactStore(),
        }),
      ),
      clock,
      olderThanMs: 60_000,
    });
    const result = await cleanup({ organizationId: ORG });
    expect(result.deleted).toBe(1);
    expect(await storage.getObject({ organizationId: ORG, key: referencedKey })).not.toBeNull();
    expect(await storage.getObject({ organizationId: ORG, key: orphanKey })).toBeNull();
  });
});
