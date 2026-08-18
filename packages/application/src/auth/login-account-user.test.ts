import { describe, expect, it } from 'vitest';
import { AuthenticationError } from '@esign/domain';
import {
  createSha256Hashing,
  createSigningTokenGenerator,
  createSigningTokenHasher,
  createUuidIdGenerator,
} from '../ports/node-crypto.js';
import { createLoginAccountUser } from './login-account-user.js';
import { createLocalIdentityProvider } from './local-identity-provider.js';
import {
  createMemoryAccountSecurityAuditWriter,
  createMemoryAccountSessionRepository,
  createMemoryUserRepository,
} from './memory-adapters.js';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-08-18T12:00:00.000Z';
const SHARED_SECRET = 'local-dev-only-shared-secret';

function user() {
  return {
    id: USER_ID,
    email: 'ada@example.test',
    displayName: 'Ada Example',
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

describe('local identity provider', () => {
  const hashing = createSha256Hashing();

  it('returns the same failure for an unknown email and a wrong secret', async () => {
    const provider = createLocalIdentityProvider({
      hashing,
      sharedSecret: SHARED_SECRET,
      findByEmail: async (email) => (email === 'ada@example.test' ? { email } : null),
    });
    const unknown = await provider.authenticate({
      email: 'missing@example.test',
      secret: SHARED_SECRET,
    });
    const wrongSecret = await provider.authenticate({
      email: 'ada@example.test',
      secret: 'not-the-shared-secret',
    });
    expect(unknown).toBeNull();
    expect(wrongSecret).toBeNull();
  });

  it('authenticates an existing local user with the shared development secret', async () => {
    const provider = createLocalIdentityProvider({
      hashing,
      sharedSecret: SHARED_SECRET,
      findByEmail: async (email) => (email === 'ada@example.test' ? { email } : null),
    });
    await expect(
      provider.authenticate({ email: 'Ada@example.test', secret: SHARED_SECRET }),
    ).resolves.toEqual({ email: 'ada@example.test' });
  });
});

describe('loginAccountUser', () => {
  it('issues a new session and revokes a pre-auth cookie to prevent fixation', async () => {
    const users = createMemoryUserRepository([user()]);
    const sessions = createMemoryAccountSessionRepository();
    const audit = createMemoryAccountSecurityAuditWriter();
    const hasher = createSigningTokenHasher();
    const login = createLoginAccountUser({
      identityProvider: createLocalIdentityProvider({
        hashing: createSha256Hashing(),
        sharedSecret: SHARED_SECRET,
        findByEmail: (email) => users.findByEmail({ email }),
      }),
      providerName: 'local',
      users,
      sessions,
      tokens: createSigningTokenGenerator(),
      hasher,
      ids: createUuidIdGenerator(),
      clock: { nowUtc: () => new Date(NOW) },
      audit,
      sessionTtlMs: 60_000,
    });

    const first = await login({
      email: 'ada@example.test',
      secret: SHARED_SECRET,
      requestId: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
    });
    const second = await login({
      email: 'ada@example.test',
      secret: SHARED_SECRET,
      requestId: 'ffffffff-ffff-4fff-8fff-fffffffffff2',
      existingSessionTokenHash: hasher.hash(first.rawSessionToken),
    });

    expect(second.rawSessionToken).not.toBe(first.rawSessionToken);
    expect(second.session.id).not.toBe(first.session.id);
    const previous = await sessions.findById({ sessionId: first.session.id });
    expect(previous?.revokedAt).toEqual(new Date(NOW));
    expect(audit.events.map((event) => event.type)).toEqual(['login_succeeded', 'login_succeeded']);
    expect(JSON.stringify(audit.events)).not.toContain(SHARED_SECRET);
    expect(JSON.stringify(audit.events)).not.toContain(second.rawSessionToken);
  });

  it('does not distinguish unknown accounts from bad secrets', async () => {
    const users = createMemoryUserRepository([user()]);
    const audit = createMemoryAccountSecurityAuditWriter();
    const login = createLoginAccountUser({
      identityProvider: createLocalIdentityProvider({
        hashing: createSha256Hashing(),
        sharedSecret: SHARED_SECRET,
        findByEmail: (email) => users.findByEmail({ email }),
      }),
      providerName: 'local',
      users,
      sessions: createMemoryAccountSessionRepository(),
      tokens: createSigningTokenGenerator(),
      hasher: createSigningTokenHasher(),
      ids: createUuidIdGenerator(),
      clock: { nowUtc: () => new Date(NOW) },
      audit,
      sessionTtlMs: 60_000,
    });

    await expect(
      login({
        email: 'missing@example.test',
        secret: SHARED_SECRET,
        requestId: 'ffffffff-ffff-4fff-8fff-fffffffffff3',
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      login({
        email: 'ada@example.test',
        secret: 'wrong-secret-value',
        requestId: 'ffffffff-ffff-4fff-8fff-fffffffffff4',
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(audit.events.map((event) => event.type)).toEqual(['login_failed', 'login_failed']);
    expect(JSON.stringify(audit.events)).not.toContain('missing@example.test');
    expect(JSON.stringify(audit.events)).not.toContain('wrong-secret-value');
  });
});
