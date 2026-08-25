import { EnvironmentValidationError, type ApiConfig } from '@esign/config';
import {
  createAssertAccountAction,
  createLoadCurrentAccountUser,
  createLocalIdentityProvider,
  createLoginAccountUser,
  createLogoutAccountUser,
  createMembershipAuthorizationPolicy,
  createMemoryRateLimiter,
  createResolveAccountSession,
  createResolveOrganizationActor,
  createRevokeAccountSession,
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createSystemClock,
  createUuidIdGenerator,
} from '@esign/application';
import {
  createPrismaAccountSecurityAuditWriter,
  createPrismaAccountSessionRepository,
  createPrismaMembershipRepository,
  createPrismaUserRepository,
  type PrismaClient,
} from '@esign/database';
import { createAccountAuthRouter } from './http/routes/account-auth.js';
import { createOidcIdentityProvider } from './infrastructure/oidc-identity-provider.js';
import type { Router } from 'express';
import type { ResolveAccountSession, ResolveOrganizationActor } from '@esign/application';
import type { SigningTokenHasher } from '@esign/domain';

export function createAccountAuthFromPrisma(input: { config: ApiConfig; prisma: PrismaClient }): {
  router: Router;
  resolveSession: ResolveAccountSession;
  resolveActor: ResolveOrganizationActor;
  hasher: SigningTokenHasher;
} {
  const hashing = createSha256Hashing();
  const hasher = createSigningTokenHasher(hashing, { pepper: input.config.TOKEN_HASH_PEPPER });
  const clock = createSystemClock();
  const ids = createUuidIdGenerator();
  const tokens = createSigningTokenGenerator();
  const users = createPrismaUserRepository(input.prisma);
  const memberships = createPrismaMembershipRepository(input.prisma);
  const sessions = createPrismaAccountSessionRepository(input.prisma);
  const audit = createPrismaAccountSecurityAuditWriter(input.prisma);
  const identityProvider =
    input.config.AUTH_PROVIDER === 'local'
      ? createLocalIdentityProvider({
          hashing,
          sharedSecret: requireLocalSharedSecret(input.config),
          findByEmail: (email) => users.findByEmail({ email }),
        })
      : createOidcIdentityProvider();

  const login = createLoginAccountUser({
    identityProvider,
    providerName: input.config.AUTH_PROVIDER,
    users,
    sessions,
    tokens,
    hasher,
    ids,
    clock,
    audit,
    sessionTtlMs: input.config.AUTH_SESSION_TTL_SECONDS * 1000,
  });

  const resolveSession = createResolveAccountSession({ sessions, hasher, clock });
  const resolveActor = createResolveOrganizationActor({ memberships });

  return {
    router: createAccountAuthRouter({
      config: input.config,
      login,
      logout: createLogoutAccountUser({ sessions, clock, ids, audit }),
      revokeSession: createRevokeAccountSession({ sessions, clock, ids, audit }),
      resolveSession,
      resolveActor,
      loadCurrentUser: createLoadCurrentAccountUser({ users }),
      assertAction: createAssertAccountAction({
        authorization: createMembershipAuthorizationPolicy(),
      }),
      hasher,
      hashing,
      loginRateLimiter: createMemoryRateLimiter({
        max: input.config.AUTH_LOGIN_RATE_LIMIT_MAX,
        windowMs: input.config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        clock,
      }),
    }),
    resolveSession,
    resolveActor,
    hasher,
  };
}

function requireLocalSharedSecret(config: ApiConfig): string {
  const secret = config.AUTH_LOCAL_SHARED_SECRET;
  if (secret === undefined || secret.trim() === '') {
    throw new EnvironmentValidationError([
      'AUTH_LOCAL_SHARED_SECRET is required when AUTH_PROVIDER=local',
    ]);
  }
  return secret;
}
