import {
  actorId,
  actorType,
  organizationContextFromActor,
  ValidationError,
  IntegrityError,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type Hashing,
  type IdempotencyRecordRepository,
  type IdGenerator,
  type SigningTokenGenerator,
  type SigningTokenHasher,
  type UnitOfWork,
} from '@esign/domain';
import { PDF_CONTENT_TYPE, sanitizeDisplayFilename } from './pdf.js';
import {
  CREATE_DOCUMENT_ROUTE,
  replayOrBeginIdempotency,
  requireIdempotencyKey,
} from './idempotency.js';
import { toPublicDocument, type PublicDocument } from './public-document.js';

export type CreateDraftDocumentInput = {
  readonly actor: AccountUserActor;
  readonly title: string;
  readonly filename: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
};

export type CreateDraftDocumentResult = PublicDocument & {
  readonly upload: {
    readonly url: string;
    readonly method: 'PUT';
    readonly expiresAt: string;
    readonly maxBytes: number;
    readonly contentType: string;
    readonly tokenHeader: string;
    readonly token: string | null;
  };
};

export function createCreateDraftDocument(deps: {
  authorization: AuthorizationPolicy;
  idempotency: IdempotencyRecordRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  hashing: Hashing;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  maxUploadBytes: number;
  uploadTtlMs: number;
  idempotencyTtlMs: number;
  uploadTokenHeader: string;
}) {
  return async function createDraftDocument(
    input: CreateDraftDocumentInput,
  ): Promise<CreateDraftDocumentResult> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.write', { organizationId });
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const displayName = sanitizeDisplayFilename(input.filename);
    const title = input.title.trim();
    if (title.length < 1 || title.length > 200) {
      throw new ValidationError({ field: 'title', reason: 'invalid' });
    }

    const begun = await replayOrBeginIdempotency({
      records: deps.idempotency,
      hashing: deps.hashing,
      ids: deps.ids,
      organizationId,
      principalId: input.actor.userId,
      route: CREATE_DOCUMENT_ROUTE,
      key: idempotencyKey,
      request: { title, filename: input.filename },
      now: deps.clock.nowUtc(),
      ttlMs: deps.idempotencyTtlMs,
    });

    if ('replay' in begun) {
      const body = begun.replay.responseBody;
      return replayCreateResponse(body, deps.uploadTokenHeader);
    }

    const now = deps.clock.nowUtc();
    const documentId = deps.ids.next();
    const uploadSessionId = deps.ids.next();
    const rawToken = deps.tokens.generateRawToken();
    const tokenHash = deps.hasher.hash(rawToken);
    const expiresAt = new Date(now.getTime() + deps.uploadTtlMs);

    await deps.unitOfWork.run(async (scope) => {
      await scope.documents.create({
        organizationId,
        document: {
          id: documentId,
          organizationId,
          ownerMembershipId: input.actor.membership.membershipId,
          title,
          state: 'draft',
          inspectionStatus: 'pending',
          sourceDisplayName: displayName,
          expiresAt: null,
          currentRevisionId: null,
          signingRevisionId: null,
          version: 1,
          leaseOwner: null,
          leaseUntil: null,
          finalizationAttemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
      await scope.uploadSessions.create({
        organizationId,
        session: {
          id: uploadSessionId,
          organizationId,
          documentId,
          tokenHash,
          status: 'issued',
          displayName,
          contentType: PDF_CONTENT_TYPE,
          maxBytes: BigInt(deps.maxUploadBytes),
          expiresAt,
          completedAt: null,
          revisionId: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId,
        type: 'document_created',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: { documentId, uploadSessionId },
        requestId: input.requestId,
      });
    });

    const publicDocument = toPublicDocument(
      {
        id: documentId,
        organizationId,
        ownerMembershipId: input.actor.membership.membershipId,
        title,
        state: 'draft',
        inspectionStatus: 'pending',
        sourceDisplayName: displayName,
        expiresAt: null,
        currentRevisionId: null,
        signingRevisionId: null,
        version: 1,
        leaseOwner: null,
        leaseUntil: null,
        finalizationAttemptCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      null,
    );
    const storedBody = {
      ...publicDocument,
      upload: {
        url: `/organizations/${organizationId}/documents/${documentId}/source`,
        method: 'PUT' as const,
        expiresAt: expiresAt.toISOString(),
        maxBytes: deps.maxUploadBytes,
        contentType: PDF_CONTENT_TYPE,
        tokenHeader: deps.uploadTokenHeader,
      },
    };
    await deps.idempotency.complete({
      organizationId,
      recordId: begun.record.id,
      responseStatus: 201,
      responseBody: storedBody,
    });

    return {
      ...storedBody,
      upload: {
        ...storedBody.upload,
        token: rawToken,
      },
    };
  };
}

export type CreateDraftDocument = ReturnType<typeof createCreateDraftDocument>;

function replayCreateResponse(
  body: Readonly<Record<string, unknown>> | null,
  uploadTokenHeader: string,
): CreateDraftDocumentResult {
  if (body === null) {
    throw new IntegrityError({ reason: 'idempotency_replay_missing_body' });
  }
  const upload = body.upload as Record<string, unknown> | undefined;
  return {
    documentId: String(body.documentId),
    title: String(body.title),
    state: body.state as CreateDraftDocumentResult['state'],
    inspectionStatus: body.inspectionStatus as CreateDraftDocumentResult['inspectionStatus'],
    displayName: body.displayName === null ? null : String(body.displayName),
    availableForSigning: Boolean(body.availableForSigning),
    currentRevision: (body.currentRevision as CreateDraftDocumentResult['currentRevision']) ?? null,
    upload: {
      url: String(upload?.url ?? ''),
      method: 'PUT',
      expiresAt: String(upload?.expiresAt ?? ''),
      maxBytes: Number(upload?.maxBytes ?? 0),
      contentType: String(upload?.contentType ?? PDF_CONTENT_TYPE),
      tokenHeader: String(upload?.tokenHeader ?? uploadTokenHeader),
      token: null,
    },
  };
}
