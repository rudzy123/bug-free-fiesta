import { timingSafeEqual } from 'node:crypto';
import type { AuthenticatedIdentity, Hashing, IdentityProvider } from '@esign/domain';

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function secretsMatch(hashing: Hashing, presented: string, expected: string): boolean {
  const presentedDigest = Buffer.from(hashing.sha256Hex(presented), 'hex');
  const expectedDigest = Buffer.from(hashing.sha256Hex(expected), 'hex');
  if (presentedDigest.length !== expectedDigest.length) {
    return false;
  }
  return timingSafeEqual(presentedDigest, expectedDigest);
}

/**
 * Development/test identity adapter. Does not store or stretch per-user passwords.
 * Callers must only enable this when AUTH_PROVIDER=local and NODE_ENV is not production.
 */
export function createLocalIdentityProvider(deps: {
  hashing: Hashing;
  sharedSecret: string;
  findByEmail: (email: string) => Promise<{ email: string } | null>;
}): IdentityProvider {
  return {
    async authenticate(input): Promise<AuthenticatedIdentity | null> {
      const email = normalizeAccountEmail(input.email);
      const user = await deps.findByEmail(email);
      const secretOk = secretsMatch(deps.hashing, input.secret, deps.sharedSecret);
      if (!user || !secretOk) {
        return null;
      }
      return { email: user.email };
    },
  };
}
