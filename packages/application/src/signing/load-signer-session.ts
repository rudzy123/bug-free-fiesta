import {
  AuthenticationError,
  ConflictError,
  isAvailableForSigning,
  type Clock,
  type Document,
  type DocumentRepository,
  type Signer,
  type SignerActor,
  type SignerRepository,
  type SigningEnvelopePolicy,
  type SigningSession,
  type SigningSessionRepository,
  type SigningTokenHasher,
  type SigningTokenLookup,
} from '@esign/domain';
import { hashesEqual } from '../auth/csrf.js';

export type LoadedSignerSession = {
  readonly actor: SignerActor;
  readonly session: SigningSession;
  readonly document: Document;
  readonly signer: Signer;
};

export type LoadSignerSessionInput = {
  readonly rawToken: string;
  readonly requireExchanged: boolean;
  readonly accountUserId?: string | null;
};

function rejectToken(): never {
  throw new AuthenticationError({ reason: 'signing_token' });
}

export function createLoadSignerSession(deps: {
  tokens: SigningTokenLookup;
  documents: DocumentRepository;
  signers: SignerRepository;
  sessions: SigningSessionRepository;
  hasher: SigningTokenHasher;
  clock: Clock;
  envelopePolicy: SigningEnvelopePolicy;
}) {
  const missHash = deps.hasher.hash('\0signing-token-miss');

  return async function loadSignerSession(
    input: LoadSignerSessionInput,
  ): Promise<LoadedSignerSession> {
    const tokenHash = deps.hasher.hash(input.rawToken);
    const found = await deps.tokens.findByTokenHash(tokenHash);
    const storedHash = found?.tokenHash ?? missHash;
    if (!hashesEqual(tokenHash, storedHash) || found === null) {
      rejectToken();
    }

    const now = deps.clock.nowUtc();
    if (found.status === 'revoked' || found.status === 'completed' || found.status === 'expired') {
      rejectToken();
    }
    if (found.expiresAt.getTime() <= now.getTime()) {
      if (found.status === 'issued' || found.status === 'active') {
        await deps.sessions.markExpired({
          organizationId: found.organizationId,
          sessionId: found.id,
          expiredAt: now,
        });
      }
      rejectToken();
    }
    if (input.requireExchanged && found.consumedAt === null) {
      rejectToken();
    }
    if (!input.requireExchanged && found.consumedAt !== null) {
      rejectToken();
    }

    const document = await deps.documents.findById({
      organizationId: found.organizationId,
      documentId: found.documentId,
    });
    if (!document || !isAvailableForSigning(document)) {
      throw new ConflictError({ reason: 'document_not_signable' });
    }
    const signer = await deps.signers.findById({
      organizationId: found.organizationId,
      signerId: found.signerId,
    });
    if (!signer || signer.documentId !== document.id) {
      rejectToken();
    }
    if (deps.envelopePolicy.requiresAccountAuth({ document, signer })) {
      if (input.accountUserId === undefined || input.accountUserId === null) {
        rejectToken();
      }
      if (signer.accountUserId === null || signer.accountUserId !== input.accountUserId) {
        rejectToken();
      }
    }

    const actor: SignerActor = {
      type: 'signer',
      organizationId: found.organizationId,
      documentId: found.documentId,
      signerId: found.signerId,
      sessionId: found.id,
    };
    return { actor, session: found, document, signer };
  };
}

export type LoadSignerSession = ReturnType<typeof createLoadSignerSession>;
