import {
  AuthenticationError,
  type AccountSecurityAuditWriter,
  type AccountSession,
  type AccountSessionRepository,
  type AccountUser,
  type Clock,
  type IdGenerator,
  type IdentityProvider,
  type SigningTokenGenerator,
  type SigningTokenHasher,
  type UserRepository,
} from '@esign/domain';
import { normalizeAccountEmail } from './local-identity-provider.js';

export type LoginAccountUserInput = {
  readonly email: string;
  readonly secret: string;
  readonly requestId: string;
  readonly existingSessionTokenHash?: string | null;
};

export type LoginAccountUserResult = {
  readonly user: AccountUser;
  readonly session: AccountSession;
  readonly rawSessionToken: string;
  readonly rawCsrfToken: string;
};

export function createLoginAccountUser(deps: {
  identityProvider: IdentityProvider;
  providerName: string;
  users: UserRepository;
  sessions: AccountSessionRepository;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  ids: IdGenerator;
  clock: Clock;
  audit: AccountSecurityAuditWriter;
  sessionTtlMs: number;
}) {
  return async function loginAccountUser(
    input: LoginAccountUserInput,
  ): Promise<LoginAccountUserResult> {
    const email = normalizeAccountEmail(input.email);
    const identity = await deps.identityProvider.authenticate({
      email,
      secret: input.secret,
    });

    if (!identity) {
      await appendFailedLogin(deps, input.requestId);
      throw new AuthenticationError({ reason: 'invalid_credentials' });
    }

    const user = await deps.users.findByEmail({ email: identity.email });
    if (!user) {
      await appendFailedLogin(deps, input.requestId);
      throw new AuthenticationError({ reason: 'invalid_credentials' });
    }

    if (input.existingSessionTokenHash) {
      const existing = await deps.sessions.findByTokenHash(input.existingSessionTokenHash);
      if (existing && existing.revokedAt === null) {
        await deps.sessions.revoke({
          sessionId: existing.id,
          revokedAt: deps.clock.nowUtc(),
        });
      }
    }

    const now = deps.clock.nowUtc();
    const rawSessionToken = deps.tokens.generateRawToken();
    const rawCsrfToken = deps.tokens.generateRawToken();
    const session: AccountSession = {
      id: deps.ids.next(),
      userId: user.id,
      tokenHash: deps.hasher.hash(rawSessionToken),
      csrfTokenHash: deps.hasher.hash(rawCsrfToken),
      expiresAt: new Date(now.getTime() + deps.sessionTtlMs),
      revokedAt: null,
      createdAt: now,
    };
    await deps.sessions.create(session);
    await deps.audit.append({
      id: deps.ids.next(),
      type: 'login_succeeded',
      actorUserId: user.id,
      sessionId: session.id,
      occurredAt: now,
      requestId: input.requestId,
      payload: { provider: deps.providerName },
    });

    return { user, session, rawSessionToken, rawCsrfToken };
  };
}

export type LoginAccountUser = ReturnType<typeof createLoginAccountUser>;

async function appendFailedLogin(
  deps: {
    ids: IdGenerator;
    clock: Clock;
    audit: AccountSecurityAuditWriter;
    providerName: string;
  },
  requestId: string,
): Promise<void> {
  await deps.audit.append({
    id: deps.ids.next(),
    type: 'login_failed',
    occurredAt: deps.clock.nowUtc(),
    requestId,
    payload: { provider: deps.providerName },
  });
}
