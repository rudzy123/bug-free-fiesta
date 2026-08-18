import {
  actorId,
  actorType,
  type Clock,
  type IdGenerator,
  type SigningTokenGenerator,
  type SigningTokenHasher,
  type UnitOfWork,
} from '@esign/domain';
import type { LoadSignerSession } from './load-signer-session.js';

export type ExchangeSigningTokenInput = {
  readonly rawToken: string;
  readonly requestId: string;
  readonly accountUserId?: string | null;
};

export type ExchangeSigningTokenResult = {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly rawSessionToken: string;
  readonly rawCsrfToken: string;
};

export function createExchangeSigningToken(deps: {
  loadSession: LoadSignerSession;
  unitOfWork: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
}) {
  return async function exchangeSigningToken(
    input: ExchangeSigningTokenInput,
  ): Promise<ExchangeSigningTokenResult> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: false,
      accountUserId: input.accountUserId,
    });
    const now = deps.clock.nowUtc();
    const rawSessionToken = deps.tokens.generateRawToken();
    const rawCsrfToken = deps.tokens.generateRawToken();

    const rotated = await deps.unitOfWork.run(async (scope) => {
      const session = await scope.signingSessions.consumeAndRotate({
        organizationId: loaded.session.organizationId,
        sessionId: loaded.session.id,
        expectedVersion: loaded.session.version,
        tokenHash: deps.hasher.hash(rawSessionToken),
        csrfTokenHash: deps.hasher.hash(rawCsrfToken),
        consumedAt: now,
      });
      await scope.audit.append({
        id: deps.ids.next(),
        organizationId: loaded.session.organizationId,
        documentId: loaded.session.documentId,
        type: 'session_exchanged',
        actorType: actorType(loaded.actor),
        actorId: actorId(loaded.actor),
        occurredAt: now,
        payload: { sessionId: session.id, signerId: loaded.signer.id },
        requestId: input.requestId,
      });
      return session;
    });

    return {
      sessionId: rotated.id,
      expiresAt: rotated.expiresAt.toISOString(),
      rawSessionToken,
      rawCsrfToken,
    };
  };
}

export type ExchangeSigningToken = ReturnType<typeof createExchangeSigningToken>;
