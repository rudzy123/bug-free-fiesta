import {
  actorId,
  actorType,
  AuthenticationError,
  ConflictError,
  isAvailableForSigning,
  NotFoundError,
  organizationContextFromActor,
  type AccountUserActor,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type IdGenerator,
  type Notifier,
  type SignerRepository,
  type SigningSessionRepository,
  type SignatureFieldRepository,
  type SigningTokenGenerator,
  type SigningTokenHasher,
  type SigningTokenLookup,
  type UnitOfWork,
} from '@esign/domain';

export type RotateSigningSessionInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly signerId: string;
  readonly requestId: string;
};

export type RotateSigningSessionResult = {
  readonly signerId: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly token: string;
};

export function createRotateSigningSession(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  signers: SignerRepository;
  sessions: SigningSessionRepository;
  unitOfWork: UnitOfWork;
  notifier: Notifier;
  ids: IdGenerator;
  clock: Clock;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  sessionTtlMs: number;
}) {
  return async function rotateSigningSession(
    input: RotateSigningSessionInput,
  ): Promise<RotateSigningSessionResult> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.send', {
      organizationId,
      documentId: input.documentId,
      signerId: input.signerId,
    });
    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document || !isAvailableForSigning(document)) {
      throw new ConflictError({ reason: 'document_not_signable' });
    }
    const signer = await deps.signers.findById({
      organizationId,
      signerId: input.signerId,
    });
    if (!signer || signer.documentId !== document.id) {
      throw new NotFoundError({ resource: 'signer' });
    }
    const now = deps.clock.nowUtc();
    const rawToken = deps.tokens.generateRawToken();
    const sessionId = deps.ids.next();
    const expiresAt = new Date(now.getTime() + deps.sessionTtlMs);

    await deps.unitOfWork.run(async (scope) => {
      const open = await scope.signingSessions.listOpenBySigner({
        organizationId,
        signerId: signer.id,
      });
      for (const session of open) {
        await scope.signingSessions.revoke({
          organizationId,
          sessionId: session.id,
          revokedAt: now,
        });
        await scope.audit.append({
          id: deps.ids.next(),
          organizationId,
          documentId: document.id,
          type: 'session_revoked',
          actorType: actorType(input.actor),
          actorId: actorId(input.actor),
          occurredAt: now,
          payload: { signerId: signer.id, sessionId: session.id, reason: 'rotated' },
          requestId: input.requestId,
        });
      }
      await scope.signingSessions.create({
        organizationId,
        session: {
          id: sessionId,
          organizationId,
          documentId: document.id,
          signerId: signer.id,
          tokenHash: deps.hasher.hash(rawToken),
          status: 'issued',
          expiresAt,
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
        },
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'session_issued',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: { signerId: signer.id, sessionId, reason: 'rotated' },
        requestId: input.requestId,
      });
    });

    await deps.notifier.sendSigningInvitation({
      organizationId,
      documentId: document.id,
      signerId: signer.id,
      sessionId,
      to: signer.email,
      expiresAt,
      rawToken,
    });

    return {
      signerId: signer.id,
      sessionId,
      expiresAt: expiresAt.toISOString(),
      token: rawToken,
    };
  };
}

export type RotateSigningSession = ReturnType<typeof createRotateSigningSession>;

export type RevokeSigningSessionInput = {
  readonly actor: AccountUserActor;
  readonly documentId: string;
  readonly sessionId: string;
  readonly requestId: string;
};

export function createRevokeSigningSession(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  sessions: SigningSessionRepository;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}) {
  return async function revokeSigningSession(input: RevokeSigningSessionInput): Promise<{
    sessionId: string;
    status: 'revoked';
  }> {
    const { organizationId } = organizationContextFromActor(input.actor);
    deps.authorization.assertAllowed(input.actor, 'document.send', {
      organizationId,
      documentId: input.documentId,
    });
    const document = await deps.documents.findById({
      organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }
    const session = await deps.sessions.findById({
      organizationId,
      sessionId: input.sessionId,
    });
    if (!session || session.documentId !== document.id) {
      throw new NotFoundError({ resource: 'signing_session' });
    }
    const now = deps.clock.nowUtc();
    await deps.unitOfWork.run(async (scope) => {
      await scope.signingSessions.revoke({
        organizationId,
        sessionId: session.id,
        revokedAt: now,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId,
        documentId: document.id,
        type: 'session_revoked',
        actorType: actorType(input.actor),
        actorId: actorId(input.actor),
        occurredAt: now,
        payload: { signerId: session.signerId, sessionId: session.id },
        requestId: input.requestId,
      });
    });
    return { sessionId: session.id, status: 'revoked' };
  };
}

export type RevokeSigningSession = ReturnType<typeof createRevokeSigningSession>;

export type ResolveSigningSessionInput = {
  readonly rawToken: string;
  readonly claimedDocumentId?: string;
  readonly claimedSignerId?: string;
};

export type SignerSessionView = {
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly sessionStatus: 'issued' | 'active';
  readonly title: string;
  readonly signingMode: string;
  readonly expiresAt: string;
  readonly fields: readonly {
    readonly fieldId: string;
    readonly type: string;
    readonly pageNumber: number;
    readonly required: boolean;
  }[];
};

export function createResolveSigningSession(deps: {
  tokens: SigningTokenLookup;
  documents: DocumentRepository;
  fields: { listByDocument: SignatureFieldRepository['listByDocument'] };
  sessions: SigningSessionRepository;
  hasher: SigningTokenHasher;
  clock: Clock;
}) {
  return async function resolveSigningSession(
    input: ResolveSigningSessionInput,
  ): Promise<SignerSessionView> {
    const session = await deps.tokens.findByTokenHash(deps.hasher.hash(input.rawToken));
    if (!session) {
      throw new AuthenticationError({ reason: 'signing_token' });
    }
    if (session.status === 'revoked') {
      throw new AuthenticationError({ reason: 'signing_token_revoked' });
    }
    const now = deps.clock.nowUtc();
    if (session.status === 'expired' || session.expiresAt.getTime() <= now.getTime()) {
      if (session.status === 'issued' || session.status === 'active') {
        await deps.sessions.markExpired({
          organizationId: session.organizationId,
          sessionId: session.id,
          expiredAt: now,
        });
      }
      throw new AuthenticationError({ reason: 'signing_token_expired' });
    }
    if (session.status !== 'issued' && session.status !== 'active') {
      throw new AuthenticationError({ reason: 'signing_token' });
    }
    if (input.claimedDocumentId !== undefined && input.claimedDocumentId !== session.documentId) {
      throw new AuthenticationError({ reason: 'document_mismatch' });
    }
    if (input.claimedSignerId !== undefined && input.claimedSignerId !== session.signerId) {
      throw new AuthenticationError({ reason: 'signer_mismatch' });
    }

    const presented =
      session.status === 'issued'
        ? await deps.sessions.markPresented({
            organizationId: session.organizationId,
            sessionId: session.id,
            presentedAt: now,
          })
        : session;

    const document = await deps.documents.findById({
      organizationId: session.organizationId,
      documentId: session.documentId,
    });
    if (!document || !isAvailableForSigning(document)) {
      throw new ConflictError({ reason: 'document_not_signable' });
    }
    const fields = await deps.fields.listByDocument({
      organizationId: session.organizationId,
      documentId: session.documentId,
    });
    return {
      documentId: session.documentId,
      signerId: session.signerId,
      sessionId: presented.id,
      sessionStatus: presented.status === 'active' ? 'active' : 'issued',
      title: document.title,
      signingMode: document.signingMode,
      expiresAt: session.expiresAt.toISOString(),
      fields: fields
        .filter((field) => field.signerId === session.signerId)
        .map((field) => ({
          fieldId: field.id,
          type: field.type,
          pageNumber: field.pageNumber,
          required: field.required,
        })),
    };
  };
}

export type ResolveSigningSession = ReturnType<typeof createResolveSigningSession>;
