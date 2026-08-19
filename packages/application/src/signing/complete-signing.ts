import {
  actorId,
  actorType,
  canSignerActNow,
  ConflictError,
  FLATTEN_SIGNATURE_JOB_TYPE,
  IntegrityError,
  signatureImageObjectKey,
  ValidationError,
  type AuthorizationPolicy,
  type Clock,
  type Hashing,
  type IdGenerator,
  type IdempotencyRecordRepository,
  type ObjectStorage,
  type ConsentRecordRepository,
  type SignatureField,
  type SignatureFieldRepository,
  type SignerRepository,
  type UnitOfWork,
} from '@esign/domain';
import { replayOrBeginIdempotency, requireIdempotencyKey } from '../documents/idempotency.js';
import { decodePngBase64, PNG_CONTENT_TYPE, validateSignaturePng } from '../documents/png.js';
import type { LoadSignerSession } from './load-signer-session.js';

export const COMPLETE_SIGNING_ROUTE = 'POST /signing/complete';

export type CompleteSigningInk = {
  readonly pngBase64: string;
};

export type CompleteSigningInput = {
  readonly rawToken: string;
  readonly consentCopyId: string;
  readonly intentToSign: true;
  readonly fieldIds: readonly string[];
  readonly signature?: CompleteSigningInk;
  readonly initials?: CompleteSigningInk;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly accountUserId?: string | null;
};

export type CompleteSigningResult = {
  readonly status: 'accepted' | 'pending';
  readonly documentId: string;
  readonly signerId: string;
};

export function createCompleteSigning(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  signers: SignerRepository;
  fields: SignatureFieldRepository;
  consent: ConsentRecordRepository;
  storage: ObjectStorage;
  hashing: Hashing;
  idempotency: IdempotencyRecordRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  idempotencyTtlMs: number;
  maxPngBytes: number;
}) {
  return async function completeSigning(
    input: CompleteSigningInput,
  ): Promise<CompleteSigningResult> {
    if (input.intentToSign !== true) {
      throw new ValidationError({ field: 'intentToSign', reason: 'required' });
    }
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      allowCompleted: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });

    const roster = await deps.signers.listByDocument({
      organizationId: loaded.actor.organizationId,
      documentId: loaded.document.id,
    });
    const fields = await deps.fields.listByDocument({
      organizationId: loaded.actor.organizationId,
      documentId: loaded.document.id,
    });
    const signerFields = fields.filter((field) => field.signerId === loaded.signer.id);

    if (loaded.signer.status === 'signed') {
      return {
        status: allRequiredSigned(roster) ? 'accepted' : 'pending',
        documentId: loaded.document.id,
        signerId: loaded.signer.id,
      };
    }

    if (
      !canSignerActNow({
        signingMode: loaded.document.signingMode,
        actor: loaded.signer,
        signers: roster,
      })
    ) {
      throw new ConflictError({ reason: 'signer_not_in_turn' });
    }

    const consent = await deps.consent.findBySession({
      organizationId: loaded.actor.organizationId,
      sessionId: loaded.session.id,
    });
    if (!consent || consent.consentCopyId !== input.consentCopyId) {
      throw new ValidationError({ field: 'consentCopyId', reason: 'consent_required' });
    }

    const selected = selectFields(signerFields, input.fieldIds);
    const signaturePng = input.signature
      ? validateSignaturePng(decodePngBase64(input.signature.pngBase64), deps.maxPngBytes)
      : null;
    const initialsPng = input.initials
      ? validateSignaturePng(decodePngBase64(input.initials.pngBase64), deps.maxPngBytes)
      : null;
    assertInkForFields(selected, signaturePng !== null, initialsPng !== null);

    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const begun = await replayOrBeginIdempotency({
      records: deps.idempotency,
      hashing: deps.hashing,
      ids: deps.ids,
      organizationId: loaded.actor.organizationId,
      principalId: loaded.signer.id,
      principalType: 'signer',
      route: COMPLETE_SIGNING_ROUTE,
      key: idempotencyKey,
      request: {
        documentId: loaded.document.id,
        signerId: loaded.signer.id,
        consentCopyId: input.consentCopyId,
        fieldIds: [...input.fieldIds].sort(),
        hasSignature: signaturePng !== null,
        hasInitials: initialsPng !== null,
      },
      now: deps.clock.nowUtc(),
      ttlMs: deps.idempotencyTtlMs,
      reuseInProgress: true,
    });
    if ('replay' in begun) {
      return replayCompleteResponse(begun.replay.responseBody);
    }

    const now = deps.clock.nowUtc();
    const uploads = new Map<string, { key: string; digest: string; size: bigint }>();
    if (signaturePng) {
      const digest = deps.hashing.sha256Hex(signaturePng.bytes);
      const key = signatureImageObjectKey(loaded.actor.organizationId, digest);
      await deps.storage.putObject({
        organizationId: loaded.actor.organizationId,
        key,
        body: signaturePng.bytes,
        contentType: PNG_CONTENT_TYPE,
        maxBytes: deps.maxPngBytes,
        expectedSha256Digest: digest,
      });
      uploads.set('signature', { key, digest, size: BigInt(signaturePng.bytes.byteLength) });
    }
    if (initialsPng) {
      const digest = deps.hashing.sha256Hex(initialsPng.bytes);
      const key = signatureImageObjectKey(loaded.actor.organizationId, digest);
      await deps.storage.putObject({
        organizationId: loaded.actor.organizationId,
        key,
        body: initialsPng.bytes,
        contentType: PNG_CONTENT_TYPE,
        maxBytes: deps.maxPngBytes,
        expectedSha256Digest: digest,
      });
      uploads.set('initials', { key, digest, size: BigInt(initialsPng.bytes.byteLength) });
    }

    const sourceRevisionId = loaded.document.currentRevisionId ?? loaded.document.signingRevisionId;
    if (sourceRevisionId === null) {
      throw new ValidationError({ reason: 'missing_revision' });
    }

    const result = await deps.unitOfWork.run(async (scope) => {
      for (const field of selected) {
        const ink =
          field.type === 'signature'
            ? uploads.get('signature')
            : field.type === 'initials'
              ? uploads.get('initials')
              : undefined;
        await scope.signatureFields.complete({
          organizationId: loaded.actor.organizationId,
          fieldId: field.id,
          completedAt: now,
          completionObjectKey: ink?.key ?? null,
          completionContentType: ink ? PNG_CONTENT_TYPE : null,
          completionSizeBytes: ink?.size ?? null,
          completionSha256Digest: ink?.digest ?? null,
        });
      }
      await scope.signers.markSigned({
        organizationId: loaded.actor.organizationId,
        signerId: loaded.signer.id,
        expectedVersion: loaded.signer.version,
        completedAt: now,
      });
      await scope.signingSessions.markCompleted({
        organizationId: loaded.actor.organizationId,
        sessionId: loaded.session.id,
        completedAt: now,
      });
      const remaining = roster.map((row) =>
        row.id === loaded.signer.id ? { ...row, status: 'signed' as const } : row,
      );
      const documentCompleted = allRequiredSigned(remaining);
      if (documentCompleted) {
        await scope.documents.markCompleted({
          organizationId: loaded.actor.organizationId,
          documentId: loaded.document.id,
          expectedVersion: loaded.document.version,
        });
      } else if (loaded.document.state === 'sent') {
        await scope.documents.markInProgress({
          organizationId: loaded.actor.organizationId,
          documentId: loaded.document.id,
          expectedVersion: loaded.document.version,
        });
      }
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        type: 'signer_signed',
        actorType: actorType(loaded.actor),
        actorId: actorId(loaded.actor),
        occurredAt: now,
        payload: {
          signerId: loaded.signer.id,
          sessionId: loaded.session.id,
          fieldIds: selected.map((field) => field.id),
          consentCopyId: consent.consentCopyId,
        },
        requestId: input.requestId,
      });
      await scope.jobs.publish({
        id: deps.ids.next(),
        jobId: deps.ids.next(),
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        type: FLATTEN_SIGNATURE_JOB_TYPE,
        payload: {
          documentId: loaded.document.id,
          signerId: loaded.signer.id,
          sessionId: loaded.session.id,
          revisionId: sourceRevisionId,
        },
        requestId: input.requestId,
        availableAt: now,
      });
      return {
        status: documentCompleted ? ('accepted' as const) : ('pending' as const),
        documentId: loaded.document.id,
        signerId: loaded.signer.id,
      };
    });

    await deps.idempotency.complete({
      organizationId: loaded.actor.organizationId,
      recordId: begun.record.id,
      responseStatus: 200,
      responseBody: result,
    });
    return result;
  };
}

export type CompleteSigning = ReturnType<typeof createCompleteSigning>;

function allRequiredSigned(signers: readonly { status: string }[]): boolean {
  return signers.every((signer) => signer.status === 'signed');
}

function selectFields(
  signerFields: readonly SignatureField[],
  fieldIds: readonly string[],
): SignatureField[] {
  const requested = new Set(fieldIds);
  const selected = signerFields.filter((field) => requested.has(field.id));
  if (selected.length !== requested.size) {
    throw new ValidationError({ field: 'fieldIds', reason: 'unknown_field' });
  }
  const required = signerFields.filter((field) => field.required);
  for (const field of required) {
    if (!requested.has(field.id)) {
      throw new ValidationError({ field: 'fieldIds', reason: 'required_field_missing' });
    }
  }
  return selected;
}

function assertInkForFields(
  fields: readonly SignatureField[],
  hasSignature: boolean,
  hasInitials: boolean,
): void {
  if (fields.some((field) => field.type === 'signature') && !hasSignature) {
    throw new ValidationError({ field: 'signature', reason: 'required' });
  }
  if (fields.some((field) => field.type === 'initials') && !hasInitials) {
    throw new ValidationError({ field: 'initials', reason: 'required' });
  }
}

function replayCompleteResponse(
  body: Readonly<Record<string, unknown>> | null,
): CompleteSigningResult {
  if (body === null) {
    throw new IntegrityError({ reason: 'idempotency_replay_missing_body' });
  }
  return {
    status: body.status === 'pending' ? 'pending' : 'accepted',
    documentId: String(body.documentId),
    signerId: String(body.signerId),
  };
}
