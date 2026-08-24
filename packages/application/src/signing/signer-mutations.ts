import {
  actorId,
  actorType,
  assertDocumentTransition,
  canSignerActNow,
  ConflictError,
  ValidationError,
  type AuthorizationPolicy,
  type ClientRequestMetadata,
  type Clock,
  type ConsentDisclosureCatalog,
  type ConsentRecordRepository,
  type IdGenerator,
  type SignerRepository,
  type UnitOfWork,
} from '@esign/domain';
import type { LoadSignerSession } from './load-signer-session.js';

export type RecordSignerViewedResult = {
  readonly viewed: true;
};

export type RecordSignerConsentInput = {
  readonly rawToken: string;
  readonly copyId: string;
  readonly accepted: boolean;
  readonly requestId: string;
  readonly metadata: ClientRequestMetadata;
  readonly accountUserId?: string | null;
};

export type RecordSignerConsentResult = {
  readonly consentId: string;
  readonly copyId: string;
  readonly acceptedAt: string;
};

export type DeclineToSignInput = {
  readonly rawToken: string;
  readonly reason?: string;
  readonly requestId: string;
  readonly metadata: ClientRequestMetadata;
  readonly accountUserId?: string | null;
};

export type DeclineToSignResult = {
  readonly documentId: string;
  readonly signerId: string;
  readonly status: 'declined';
};

export function createRecordSignerViewed(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function recordSignerViewed(input: {
    rawToken: string;
    requestId: string;
    accountUserId?: string | null;
  }): Promise<RecordSignerViewedResult> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const now = deps.clock.nowUtc();
    await deps.unitOfWork.run(async (scope) => {
      await scope.signingSessions.markPresented({
        organizationId: loaded.session.organizationId,
        sessionId: loaded.session.id,
        presentedAt: now,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: loaded.session.organizationId,
        documentId: loaded.document.id,
        type: 'document_viewed',
        actorType: actorType(loaded.actor),
        actorId: actorId(loaded.actor),
        occurredAt: now,
        payload: { sessionId: loaded.session.id, signerId: loaded.signer.id },
        requestId: input.requestId,
      });
    });
    return { viewed: true };
  };
}

export type RecordSignerViewed = ReturnType<typeof createRecordSignerViewed>;

export function createRecordSignerConsent(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  catalog: ConsentDisclosureCatalog;
  consent: ConsentRecordRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function recordSignerConsent(
    input: RecordSignerConsentInput,
  ): Promise<RecordSignerConsentResult> {
    if (input.accepted !== true) {
      throw new ValidationError({ field: 'accepted', reason: 'explicit_consent_required' });
    }
    const disclosure = deps.catalog.findByCopyId(input.copyId);
    if (disclosure === null) {
      throw new ValidationError({ field: 'copyId', reason: 'unknown_disclosure' });
    }
    const current = deps.catalog.current();
    if (disclosure.copyId !== current.copyId) {
      throw new ValidationError({ field: 'copyId', reason: 'stale_disclosure' });
    }
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const existing = await deps.consent.findBySession({
      organizationId: loaded.actor.organizationId,
      sessionId: loaded.session.id,
    });
    if (existing) {
      return {
        consentId: existing.id,
        copyId: existing.consentCopyId,
        acceptedAt: existing.acceptedAt.toISOString(),
      };
    }
    const now = deps.clock.nowUtc();
    const consentId = deps.ids.next();
    await deps.unitOfWork.run(async (scope) => {
      await scope.consentRecords.create({
        organizationId: loaded.actor.organizationId,
        consent: {
          id: consentId,
          organizationId: loaded.actor.organizationId,
          documentId: loaded.document.id,
          signerId: loaded.signer.id,
          sessionId: loaded.session.id,
          consentCopyId: disclosure.copyId,
          acceptedAt: now,
          requestId: input.requestId,
          untrustedClientIp: input.metadata.untrustedClientIp,
          untrustedUserAgent: input.metadata.untrustedUserAgent,
          createdAt: now,
        },
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        type: 'consent_recorded',
        actorType: actorType(loaded.actor),
        actorId: actorId(loaded.actor),
        occurredAt: now,
        payload: { sessionId: loaded.session.id, consentCopyId: disclosure.copyId },
        requestId: input.requestId,
      });
    });
    return {
      consentId,
      copyId: disclosure.copyId,
      acceptedAt: now.toISOString(),
    };
  };
}

export type RecordSignerConsent = ReturnType<typeof createRecordSignerConsent>;

export function createDeclineToSign(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  signers: SignerRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  onSigningCompletion?: (input: { outcome: 'declined' }) => void;
}) {
  return async function declineToSign(input: DeclineToSignInput): Promise<DeclineToSignResult> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
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
    if (
      !canSignerActNow({
        signingMode: loaded.document.signingMode,
        actor: loaded.signer,
        signers: roster,
      })
    ) {
      throw new ConflictError({ reason: 'signer_not_in_turn' });
    }
    if (loaded.signer.status === 'declined') {
      return {
        documentId: loaded.document.id,
        signerId: loaded.signer.id,
        status: 'declined',
      };
    }
    if (loaded.signer.status !== 'pending') {
      throw new ConflictError({ reason: 'signer_not_pending' });
    }
    assertDocumentTransition(loaded.document.state, 'declined');
    const now = deps.clock.nowUtc();
    const reason = sanitizeDeclineReason(input.reason);
    await deps.unitOfWork.run(async (scope) => {
      await scope.signers.markDeclined({
        organizationId: loaded.actor.organizationId,
        signerId: loaded.signer.id,
        expectedVersion: loaded.signer.version,
        declinedAt: now,
      });
      await scope.documents.markDeclined({
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        expectedVersion: loaded.document.version,
      });
      const open = await scope.signingSessions.listByDocument({
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
      });
      for (const session of open) {
        if (session.status === 'issued' || session.status === 'active') {
          await scope.signingSessions.revoke({
            organizationId: loaded.actor.organizationId,
            sessionId: session.id,
            revokedAt: now,
          });
        }
      }
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        type: 'signer_declined',
        actorType: actorType(loaded.actor),
        actorId: actorId(loaded.actor),
        occurredAt: now,
        payload: {
          sessionId: loaded.session.id,
          signerId: loaded.signer.id,
          reason,
        },
        requestId: input.requestId,
      });
    });
    deps.onSigningCompletion?.({ outcome: 'declined' });
    return {
      documentId: loaded.document.id,
      signerId: loaded.signer.id,
      status: 'declined',
    };
  };
}

export type DeclineToSign = ReturnType<typeof createDeclineToSign>;

export function sanitizeDeclineReason(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  let cleaned = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      cleaned += char;
    }
  }
  cleaned = cleaned.trim();
  if (cleaned === '') {
    return null;
  }
  return cleaned.slice(0, 500);
}
