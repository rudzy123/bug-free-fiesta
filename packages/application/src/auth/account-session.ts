import {
  AuthenticationError,
  type AccountSecurityAuditWriter,
  type AccountSession,
  type AccountSessionRepository,
  type Clock,
  type IdGenerator,
  type SigningTokenHasher,
} from '@esign/domain';

export type ResolvedAccountSession = {
  readonly session: AccountSession;
};

export function createResolveAccountSession(deps: {
  sessions: AccountSessionRepository;
  hasher: SigningTokenHasher;
  clock: Clock;
}) {
  return async function resolveAccountSession(
    rawSessionToken: string | undefined,
  ): Promise<ResolvedAccountSession> {
    if (rawSessionToken === undefined || rawSessionToken.trim() === '') {
      throw new AuthenticationError({ reason: 'missing_session' });
    }
    const session = await deps.sessions.findByTokenHash(deps.hasher.hash(rawSessionToken));
    if (!session) {
      throw new AuthenticationError({ reason: 'invalid_session' });
    }
    if (session.revokedAt !== null) {
      throw new AuthenticationError({ reason: 'revoked_session' });
    }
    if (session.expiresAt.getTime() <= deps.clock.nowUtc().getTime()) {
      throw new AuthenticationError({ reason: 'expired_session' });
    }
    return { session };
  };
}

export type ResolveAccountSession = ReturnType<typeof createResolveAccountSession>;

export function createLogoutAccountUser(deps: {
  sessions: AccountSessionRepository;
  clock: Clock;
  ids: IdGenerator;
  audit: AccountSecurityAuditWriter;
}) {
  return async function logoutAccountUser(input: {
    session: AccountSession;
    requestId: string;
  }): Promise<void> {
    await deps.sessions.revoke({
      sessionId: input.session.id,
      revokedAt: deps.clock.nowUtc(),
    });
    await deps.audit.append({
      id: deps.ids.next(),
      type: 'logout',
      actorUserId: input.session.userId,
      sessionId: input.session.id,
      occurredAt: deps.clock.nowUtc(),
      requestId: input.requestId,
      payload: {},
    });
  };
}

export type LogoutAccountUser = ReturnType<typeof createLogoutAccountUser>;

export function createRevokeAccountSession(deps: {
  sessions: AccountSessionRepository;
  clock: Clock;
  ids: IdGenerator;
  audit: AccountSecurityAuditWriter;
}) {
  return async function revokeAccountSession(input: {
    actorUserId: string;
    sessionId: string;
    requestId: string;
  }): Promise<void> {
    const session = await deps.sessions.findById({ sessionId: input.sessionId });
    if (!session || session.userId !== input.actorUserId) {
      throw new AuthenticationError({ reason: 'session_not_owned' });
    }
    if (session.revokedAt !== null) {
      return;
    }
    await deps.sessions.revoke({
      sessionId: session.id,
      revokedAt: deps.clock.nowUtc(),
    });
    await deps.audit.append({
      id: deps.ids.next(),
      type: 'session_revoked',
      actorUserId: input.actorUserId,
      sessionId: session.id,
      occurredAt: deps.clock.nowUtc(),
      requestId: input.requestId,
      payload: {},
    });
  };
}

export type RevokeAccountSession = ReturnType<typeof createRevokeAccountSession>;
