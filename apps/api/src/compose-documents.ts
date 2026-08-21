import type { ApiConfig } from '@esign/config';
import {
  createAssertAccountAction,
  createCleanupAbandonedUploads,
  createCompleteSourceUpload,
  createCompleteSigning,
  createConsentDisclosureCatalog,
  createCreateDraftDocument,
  createDeclineToSign,
  createDocumentInspector,
  createExchangeSigningToken,
  createGetOrganizationDocument,
  createGetSignerConsent,
  createGetSignerDocument,
  createGetSignerFields,
  createGetSignerSession,
  createInspectDocument,
  createIssueDocumentPreview,
  createIssueSignerPreview,
  createLoadSignerSession,
  createMembershipAuthorizationPolicy,
  createMemoryRateLimiter,
  createObjectStorageDriver,
  createNotifier,
  createRecordSignerConsent,
  createRecordSignerViewed,
  createReplaceDocumentFields,
  createReplaceDocumentSigners,
  createRevokeSigningSession,
  createRotateSigningSession,
  createSendDocument,
  createSha256Hashing,
  createSigningEnvelopePolicy,
  createSigningTokenGenerator,
  createSizeLimitedObjectStorage,
  createStreamDocumentPreview,
  createSystemClock,
  createUuidIdGenerator,
  PNG_MAX_BYTES,
} from '@esign/application';
import {
  createPrismaPreviewGrantLookup,
  createPrismaSigningTokenLookup,
  createPrismaTenantRepositories,
  createPrismaUnitOfWork,
  createPrismaUploadSessionLookup,
  type PrismaClient,
} from '@esign/database';
import { Router } from 'express';
import { createDocumentIngestionRouter } from './http/routes/documents.js';
import { createSigningRouter } from './http/routes/signing.js';
import type {
  CleanupAbandonedUploads,
  InspectDocument,
  ResolveAccountSession,
  ResolveOrganizationActor,
} from '@esign/application';
import type { ObjectStorage, SigningTokenHasher } from '@esign/domain';

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
  const signingLookup = createPrismaSigningTokenLookup(input.prisma);
  const storage = createSizeLimitedObjectStorage(
    createObjectStorageDriver({
      driver: input.config.OBJECT_STORAGE_DRIVER,
      fsRoot: input.config.OBJECT_STORAGE_FS_ROOT,
    }),
    input.config.DOCUMENT_MAX_UPLOAD_BYTES,
  );
  const inspector = createDocumentInspector({
    name: input.config.DOCUMENT_INSPECTOR,
    nodeEnv: input.config.NODE_ENV,
  });
  const notifier = createNotifier({
    name: input.config.NOTIFICATION_ADAPTER,
    nodeEnv: input.config.NODE_ENV,
    directory: input.config.NOTIFICATION_PREVIEW_DIR,
  });
  const sessionTtlMs = input.config.SIGNING_SESSION_TTL_SECONDS * 1000;

  const catalog = createConsentDisclosureCatalog({
    copyId: input.config.SIGNING_CONSENT_COPY_ID,
    version: input.config.SIGNING_CONSENT_VERSION,
    title: input.config.SIGNING_CONSENT_TITLE,
    text: input.config.SIGNING_CONSENT_TEXT,
  });
  const loadSession = createLoadSignerSession({
    tokens: signingLookup,
    documents: repos.documents,
    signers: repos.signers,
    sessions: repos.signingSessions,
    hasher,
    clock,
    envelopePolicy: createSigningEnvelopePolicy(),
  });
  const documentsRouter = createDocumentIngestionRouter({
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
      signers: repos.signers,
      fields: repos.signatureFields,
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
    replaceSigners: createReplaceDocumentSigners({
      authorization,
      documents: repos.documents,
      revisions: repos.revisions,
      signers: repos.signers,
      fields: repos.signatureFields,
      unitOfWork,
      ids,
      clock,
    }),
    replaceFields: createReplaceDocumentFields({
      authorization,
      documents: repos.documents,
      revisions: repos.revisions,
      signers: repos.signers,
      fields: repos.signatureFields,
      unitOfWork,
      ids,
      clock,
    }),
    sendDocument: createSendDocument({
      authorization,
      documents: repos.documents,
      revisions: repos.revisions,
      signers: repos.signers,
      fields: repos.signatureFields,
      idempotency: repos.idempotencyRecords,
      unitOfWork,
      notifier,
      ids,
      clock,
      hashing,
      tokens,
      hasher,
      sessionTtlMs,
      idempotencyTtlMs: input.config.IDEMPOTENCY_TTL_SECONDS * 1000,
    }),
    rotateSession: createRotateSigningSession({
      authorization,
      documents: repos.documents,
      signers: repos.signers,
      sessions: repos.signingSessions,
      unitOfWork,
      notifier,
      ids,
      clock,
      tokens,
      hasher,
      sessionTtlMs,
    }),
    revokeSession: createRevokeSigningSession({
      authorization,
      documents: repos.documents,
      sessions: repos.signingSessions,
      unitOfWork,
      ids,
      clock,
    }),
  });
  const signingRouter = createSigningRouter({
    config: input.config,
    hasher,
    rateLimiter: createMemoryRateLimiter({
      max: input.config.SIGNING_RATE_LIMIT_MAX,
      windowMs: input.config.SIGNING_RATE_LIMIT_WINDOW_MS,
      clock,
    }),
    loadCsrfHash: async (rawToken) => {
      const session = await signingLookup.findByTokenHash(hasher.hash(rawToken));
      return session?.csrfTokenHash ?? null;
    },
    exchange: createExchangeSigningToken({
      loadSession,
      unitOfWork,
      ids,
      clock,
      tokens,
      hasher,
    }),
    getSession: createGetSignerSession({
      loadSession,
      authorization,
      consent: repos.consentRecords,
      catalog,
    }),
    getDocument: createGetSignerDocument({
      loadSession,
      authorization,
      revisions: repos.revisions,
    }),
    getFields: createGetSignerFields({
      loadSession,
      authorization,
      fields: repos.signatureFields,
    }),
    getConsent: createGetSignerConsent({
      loadSession,
      authorization,
      catalog,
      consent: repos.consentRecords,
    }),
    issuePreview: createIssueSignerPreview({
      loadSession,
      authorization,
      revisions: repos.revisions,
      previewGrants: repos.previewGrants,
      tokens,
      hasher,
      ids,
      clock,
      previewTtlMs: input.config.DOCUMENT_PREVIEW_TTL_SECONDS * 1000,
      previewTokenHeader: input.config.DOCUMENT_PREVIEW_TOKEN_HEADER,
    }),
    recordViewed: createRecordSignerViewed({
      loadSession,
      authorization,
      unitOfWork,
      ids,
      clock,
    }),
    recordConsent: createRecordSignerConsent({
      loadSession,
      authorization,
      catalog,
      consent: repos.consentRecords,
      unitOfWork,
      ids,
      clock,
    }),
    decline: createDeclineToSign({
      loadSession,
      authorization,
      signers: repos.signers,
      unitOfWork,
      ids,
      clock,
    }),
    complete: createCompleteSigning({
      loadSession,
      authorization,
      signers: repos.signers,
      fields: repos.signatureFields,
      consent: repos.consentRecords,
      storage,
      hashing,
      idempotency: repos.idempotencyRecords,
      unitOfWork,
      ids,
      clock,
      idempotencyTtlMs: input.config.IDEMPOTENCY_TTL_SECONDS * 1000,
      maxPngBytes: PNG_MAX_BYTES,
    }),
  });
  const router = Router();
  router.use(documentsRouter);
  router.use(signingRouter);

  return {
    router,
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
