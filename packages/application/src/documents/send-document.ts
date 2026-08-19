import {
  actorId,
  actorType,
  assertReadyToSend,
  ConflictError,
  IntegrityError,
  NOTIFY_SIGNER_JOB_TYPE,
  NotFoundError,
  organizationContextFromActor,
  ValidationError,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type Hashing,
  type IdGenerator,
  type IdempotencyRecordRepository,
  type Notifier,
  type SignatureFieldRepository,
  type SignerRepository,
  type SigningSession,
  type SigningTokenGenerator,
  type SigningTokenHasher,
  type UnitOfWork,
} from '@esign/domain';
import { replayOrBeginIdempotency, requireIdempotencyKey } from './idempotency.js';
import { envelopeIsPrepared } from './replace-preparation.js';
import { toPublicDocument, type PublicDocument } from './public-document.js';

export const SEND_DOCUMENT_ROUTE = 'POST /organizations/:organizationId/documents/:documentId/send';

export type SendDocumentInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly expiresAt?: string | null;
  readonly idempotencyKey: string;
  readonly requestId: string;
};

export type SendDocumentResult = PublicDocument & {
  readonly invitations: readonly {
    readonly signerId: string;
    readonly sessionId: string;
    readonly expiresAt: string;
    readonly token: string | null;
  }[];
};

export function createSendDocument(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  signers: SignerRepository;
  fields: SignatureFieldRepository;
  idempotency: IdempotencyRecordRepository;
  unitOfWork: UnitOfWork;
  notifier: Notifier;
  ids: IdGenerator;
  clock: Clock;
  hashing: Hashing;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  sessionTtlMs: number;
  idempotencyTtlMs: number;
}) {
  return async function sendDocument(input: SendDocumentInput): Promise<SendDocumentResult> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.send', {
      organizationId,
      documentId: input.documentId,
    });
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const begun = await replayOrBeginIdempotency({
      records: deps.idempotency,
      hashing: deps.hashing,
      ids: deps.ids,
      organizationId,
      principalId: input.actor.userId,
      route: SEND_DOCUMENT_ROUTE,
      key: idempotencyKey,
      request: { documentId: input.documentId, expiresAt: input.expiresAt ?? null },
      now: deps.clock.nowUtc(),
      ttlMs: deps.idempotencyTtlMs,
    });
    if ('replay' in begun) {
      return replaySendResponse(begun.replay.responseBody);
    }

    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }
    assertReadyToSend(document);
    const revision =
      document.currentRevisionId === null
        ? null
        : await deps.revisions.findById({
            organizationId,
            revisionId: document.currentRevisionId,
          });
    if (!revision) {
      throw new ValidationError({ reason: 'missing_revision' });
    }
    const signers = await deps.signers.listByDocument({ organizationId, documentId: document.id });
    const fields = await deps.fields.listByDocument({ organizationId, documentId: document.id });
    if (!envelopeIsPrepared({ document, signers, fields })) {
      throw new ValidationError({ reason: 'envelope_incomplete' });
    }

    const now = deps.clock.nowUtc();
    const expiresAt = parseExpiresAt(input.expiresAt, now);
    const issued: { session: SigningSession; rawToken: string }[] = [];

    const sentDocument = await deps.unitOfWork.run(async (scope) => {
      const updated = await scope.documents.markSent({
        organizationId,
        documentId: document.id,
        expectedVersion: document.version,
        signingRevisionId: revision.id,
        expiresAt,
      });
      for (const signer of signers) {
        const open = await scope.signingSessions.listOpenBySigner({
          organizationId,
          signerId: signer.id,
        });
        if (open.length > 0) {
          throw new ConflictError({ reason: 'duplicate_open_session', signerId: signer.id });
        }
        const rawToken = deps.tokens.generateRawToken();
        const session: SigningSession = {
          id: deps.ids.next(),
          organizationId,
          documentId: document.id,
          signerId: signer.id,
          tokenHash: deps.hasher.hash(rawToken),
          csrfTokenHash: null,
          status: 'issued',
          expiresAt: new Date(now.getTime() + deps.sessionTtlMs),
          consumedAt: null,
          completedAt: null,
          revokedAt: null,
          presentationAttemptCount: 0,
          failedPresentationCount: 0,
          lastPresentedAt: null,
          requestId: input.requestId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        await scope.signingSessions.create({ organizationId, session });
        issued.push({ session, rawToken });
        await scope.audit.append({
          id: deps.ids.next(),
          organizationId,
          documentId: document.id,
          type: 'session_issued',
          actorType: actorType(input.actor),
          actorId: actorId(input.actor),
          occurredAt: now,
          payload: { signerId: signer.id, sessionId: session.id },
          requestId: input.requestId,
        });
        await scope.jobs.publish({
          id: deps.ids.next(),
          jobId: deps.ids.next(),
          organizationId,
          documentId: document.id,
          type: NOTIFY_SIGNER_JOB_TYPE,
          payload: { signerId: signer.id, sessionId: session.id },
          requestId: input.requestId,
          availableAt: now,
        });
      }
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'document_sent',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: {
          signingRevisionId: revision.id,
          sessionIds: issued.map((row) => row.session.id),
        },
        requestId: input.requestId,
      });
      return updated;
    });

    for (const row of issued) {
      const signer = signers.find((item) => item.id === row.session.signerId);
      await deps.notifier.sendSigningInvitation({
        organizationId,
        documentId: document.id,
        signerId: row.session.signerId,
        sessionId: row.session.id,
        to: signer?.email ?? null,
        expiresAt: row.session.expiresAt,
        rawToken: row.rawToken,
      });
    }

    const body = {
      ...toPublicDocument(sentDocument, revision, { signers, fields }),
      invitations: issued.map((row) => ({
        signerId: row.session.signerId,
        sessionId: row.session.id,
        expiresAt: row.session.expiresAt.toISOString(),
      })),
    };
    await deps.idempotency.complete({
      organizationId,
      recordId: begun.record.id,
      responseStatus: 200,
      responseBody: body,
    });

    return {
      ...body,
      invitations: issued.map((row) => ({
        signerId: row.session.signerId,
        sessionId: row.session.id,
        expiresAt: row.session.expiresAt.toISOString(),
        token: row.rawToken,
      })),
    };
  };
}

export type SendDocument = ReturnType<typeof createSendDocument>;

function parseExpiresAt(value: string | null | undefined, now: Date): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
    throw new ValidationError({ field: 'expiresAt', reason: 'not_in_future' });
  }
  return parsed;
}

function replaySendResponse(body: Readonly<Record<string, unknown>> | null): SendDocumentResult {
  if (body === null) {
    throw new IntegrityError({ reason: 'idempotency_replay_missing_body' });
  }
  const invitations = Array.isArray(body.invitations) ? body.invitations : [];
  return {
    documentId: String(body.documentId),
    title: String(body.title),
    state: body.state as SendDocumentResult['state'],
    signingMode: body.signingMode as SendDocumentResult['signingMode'],
    inspectionStatus: body.inspectionStatus as SendDocumentResult['inspectionStatus'],
    displayName: body.displayName === null ? null : String(body.displayName),
    availableForSigning: Boolean(body.availableForSigning),
    currentRevision: (body.currentRevision as SendDocumentResult['currentRevision']) ?? null,
    signers: (body.signers as SendDocumentResult['signers']) ?? [],
    fields: (body.fields as SendDocumentResult['fields']) ?? [],
    invitations: invitations.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        signerId: String(item.signerId),
        sessionId: String(item.sessionId),
        expiresAt: String(item.expiresAt),
        token: null,
      };
    }),
  };
}
