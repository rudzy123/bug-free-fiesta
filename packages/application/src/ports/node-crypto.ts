import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type {
  Clock,
  Hashing,
  IdGenerator,
  SigningTokenGenerator,
  SigningTokenHasher,
  UnitIntervalRandom,
} from '@esign/domain';

export function createSystemClock(): Clock {
  return {
    nowUtc: () => new Date(),
  };
}

export function createUuidIdGenerator(): IdGenerator {
  return {
    next: () => randomUUID(),
  };
}

export function createSystemUnitIntervalRandom(): UnitIntervalRandom {
  return {
    next: () => randomInt(0, 2 ** 32) / 2 ** 32,
  };
}

export function createSha256Hashing(): Hashing {
  return {
    sha256Hex(value: string | Uint8Array): string {
      return createHash('sha256').update(value).digest('hex');
    },
  };
}

export function createSigningTokenGenerator(): SigningTokenGenerator {
  return {
    generateRawToken(): string {
      return randomBytes(32).toString('base64url');
    },
  };
}

/**
 * Hashes bearer/signing/session tokens at rest. When `pepper` is set (required
 * in production via config), uses HMAC-SHA256 so a DB dump alone is insufficient
 * to verify guessed tokens (SEC-020). Output remains 64 lowercase hex chars.
 */
export function createSigningTokenHasher(
  hashing: Hashing = createSha256Hashing(),
  options?: { pepper?: string },
): SigningTokenHasher {
  const pepper = options?.pepper?.trim() || undefined;
  return {
    hash(rawToken: string): string {
      if (pepper !== undefined) {
        return createHmac('sha256', pepper).update(rawToken, 'utf8').digest('hex');
      }
      return hashing.sha256Hex(rawToken);
    },
  };
}

export function issueSigningToken(
  generator: SigningTokenGenerator,
  hasher: SigningTokenHasher,
): { rawToken: string; tokenHash: string } {
  const rawToken = generator.generateRawToken();
  return { rawToken, tokenHash: hasher.hash(rawToken) };
}
