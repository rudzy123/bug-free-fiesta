import type { ApiConfig } from '@esign/config';
import {
  createAssertAccountAction,
  createCleanupAbandonedUploads,
  createCompleteSourceUpload,
  createCreateDraftDocument,
  createDocumentInspector,
  createGetOrganizationDocument,
  createInspectDocument,
  createIssueDocumentPreview,
  createMembershipAuthorizationPolicy,
  createMemoryObjectStorage,
  createSha256Hashing,
  createSigningTokenGenerator,
  createSizeLimitedObjectStorage,
  createStreamDocumentPreview,
  createSystemClock,
  createUuidIdGenerator,
} from '@esign/application';
import {
  createPrismaPreviewGrantLookup,
  createPrismaTenantRepositories,
  createPrismaUnitOfWork,
  createPrismaUploadSessionLookup,
  type PrismaClient,
} from '@esign/database';
import { createDocumentIngestionRouter } from './http/routes/documents.js';
import type {
  CleanupAbandonedUploads,
  InspectDocument,
  ResolveAccountSession,
  ResolveOrganizationActor,
} from '@esign/application';
import type { ObjectStorage, SigningTokenHasher } from '@esign/domain';
import type { Router } from 'express';

export function createDocumentIngestionFromPrisma(input: {
  config: ApiConfig;
  prisma: PrismaClient;
  resolveSession: ResolveAccountSession;
  resolveActor: ResolveOrganizationActor;
  hasher: SigningTokenHasher;
}): {
  router: Router;
  inspect: InspectDocument;
  cleanupAbandoned: CleanupAbandonedUploads;
  storage: ObjectStorage;
} {
  const hashing = createSha256Hashing();
  const hasher = input.hasher;
  const clock = createSystemClock();
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const authorization = createMembershipAuthorizationPolicy();
  const repos = createPrismaTenantRepositories(input.prisma);
  const unitOfWork = createPrismaUnitOfWork(input.prisma);
  const uploadLookup = createPrismaUploadSessionLookup(input.prisma);
  const previewLookup = createPrismaPreviewGrantLookup(input.prisma);
  const storage = createSizeLimitedObjectStorage(
    createMemoryObjectStorage(),
    input.config.DOCUMENT_MAX_UPLOAD_BYTES,
  );
  const inspector = createDocumentInspector({
    name: input.config.DOCUMENT_INSPECTOR,
    nodeEnv: input.config.NODE_ENV,
  });

  return {
    router: createDocumentIngestionRouter({
      config: input.config,
      resolveSession: input.resolveSession,
      resolveActor: input.resolveActor,
      hasher,
      assertAction: createAssertAccountAction({ authorization }),
      createDraft: createCreateDraftDocument({
        authorization,
        idempotency: repos.idempotencyRecords,
        unitOfWork,
        ids,
        clock,
        hashing,
        tokens,
        hasher,
        maxUploadBytes: input.config.DOCUMENT_MAX_UPLOAD_BYTES,
        uploadTtlMs: input.config.DOCUMENT_UPLOAD_TTL_SECONDS * 1000,
        idempotencyTtlMs: input.config.IDEMPOTENCY_TTL_SECONDS * 1000,
        uploadTokenHeader: input.config.DOCUMENT_UPLOAD_TOKEN_HEADER,
      }),
      completeUpload: createCompleteSourceUpload({
        documents: repos.documents,
        revisions: repos.revisions,
        uploadSessions: uploadLookup,
        hasher,
        hashing,
        ids,
        clock,
        storage,
        unitOfWork,
        maxUploadBytes: input.config.DOCUMENT_MAX_UPLOAD_BYTES,
      }),
      getDocument: createGetOrganizationDocument({
        authorization,
        documents: repos.documents,
        revisions: repos.revisions,
      }),
      issuePreview: createIssueDocumentPreview({
        authorization,
        documents: repos.documents,
        revisions: repos.revisions,
        previewGrants: repos.previewGrants,
        tokens,
        hasher,
        ids,
        clock,
        previewTtlMs: input.config.DOCUMENT_PREVIEW_TTL_SECONDS * 1000,
        previewTokenHeader: input.config.DOCUMENT_PREVIEW_TOKEN_HEADER,
      }),
      streamPreview: createStreamDocumentPreview({
        grants: previewLookup,
        revisions: repos.revisions,
        storage,
        hasher,
        clock,
      }),
    }),
    inspect: createInspectDocument({
      documents: repos.documents,
      revisions: repos.revisions,
      storage,
      inspector,
      unitOfWork,
      ids,
      clock,
    }),
    cleanupAbandoned: createCleanupAbandonedUploads({
      uploadSessions: uploadLookup,
      unitOfWork,
      ids,
      clock,
      limit: 50,
    }),
    storage,
  };
}
