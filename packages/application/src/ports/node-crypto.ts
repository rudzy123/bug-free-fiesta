import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  Clock,
  Hashing,
  IdGenerator,
  SigningTokenGenerator,
  SigningTokenHasher,
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

export function createSigningTokenHasher(
  hashing: Hashing = createSha256Hashing(),
): SigningTokenHasher {
  return {
    hash(rawToken: string): string {
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
