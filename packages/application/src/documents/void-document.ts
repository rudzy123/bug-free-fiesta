import { publicDocumentSchema } from '@esign/contracts';
import {
  actorId,
  actorType,
  assertDocumentTransition,
  ConflictError,
  IntegrityError,
  NotFoundError,
  organizationContextFromActor,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type DocumentRevisionRepository,
  type Hashing,
  type IdGenerator,
  type IdempotencyRecordRepository,
  type SignatureFieldRepository,
  type SignerRepository,
  type UnitOfWork,
} from '@esign/domain';
import { replayOrBeginIdempotency, requireIdempotencyKey } from './idempotency.js';
import { toPublicDocument, type PublicDocument } from './public-document.js';

export const VOID_DOCUMENT_ROUTE = 'POST /organizations/:organizationId/documents/:documentId/void';

export type VoidDocumentInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
};

export function createVoidDocument(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  revisions: DocumentRevisionRepository;
  signers: SignerRepository;
  fields: SignatureFieldRepository;
  idempotency: IdempotencyRecordRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  hashing: Hashing;
  idempotencyTtlMs: number;
}) {
  return async function voidDocument(input: VoidDocumentInput): Promise<PublicDocument> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.void', {
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
      route: VOID_DOCUMENT_ROUTE,
      key: idempotencyKey,
      request: { documentId: input.documentId },
      now: deps.clock.nowUtc(),
      ttlMs: deps.idempotencyTtlMs,
    });
    if ('replay' in begun) {
      return replayVoidResponse(begun.replay.responseBody);
    }

    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }
    assertDocumentTransition(document.state, 'voided');

    const now = deps.clock.nowUtc();
    const voided = await deps.unitOfWork.run(async (scope) => {
      const next = await scope.documents.markVoided({
        organizationId,
        documentId: document.id,
        expectedVersion: document.version,
      });
      const open = await scope.signingSessions.listByDocument({
        organizationId,
        documentId: document.id,
      });
      const revokedSessionIds: string[] = [];
      for (const session of open) {
        if (session.status === 'issued' || session.status === 'active') {
          await scope.signingSessions.revoke({
            organizationId,
            sessionId: session.id,
            revokedAt: now,
          });
          revokedSessionIds.push(session.id);
        }
      }
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'document_voided',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: {
          previousState: document.state,
          sessionIds: revokedSessionIds,
        },
        requestId: input.requestId,
      });
      return next;
    });

    const revision =
      voided.currentRevisionId === null
        ? null
        : await deps.revisions.findById({
            organizationId,
            revisionId: voided.currentRevisionId,
          });
    const [signers, fields] = await Promise.all([
      deps.signers.listByDocument({ organizationId, documentId: voided.id }),
      deps.fields.listByDocument({ organizationId, documentId: voided.id }),
    ]);
    const body = toPublicDocument(voided, revision, { signers, fields });
    await deps.idempotency.complete({
      organizationId,
      recordId: begun.record.id,
      responseStatus: 200,
      responseBody: body,
    });
    return body;
  };
}

export type VoidDocument = ReturnType<typeof createVoidDocument>;

function replayVoidResponse(body: Readonly<Record<string, unknown>> | null): PublicDocument {
  if (body === null) {
    throw new IntegrityError({ reason: 'idempotency_replay_missing_body' });
  }
  const parsed = publicDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw new IntegrityError({ reason: 'idempotency_replay_missing_body' });
  }
  if (parsed.data.state !== 'voided') {
    throw new ConflictError({ reason: 'document_not_voidable' });
  }
  return {
    documentId: parsed.data.documentId,
    title: parsed.data.title,
    state: 'voided',
    signingMode: parsed.data.signingMode,
    inspectionStatus: parsed.data.inspectionStatus,
    displayName: parsed.data.displayName,
    availableForSigning: parsed.data.availableForSigning,
    currentRevision: parsed.data.currentRevision,
    signers: parsed.data.signers,
    fields: parsed.data.fields,
  };
}
