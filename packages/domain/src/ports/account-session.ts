import type { AccountSession } from '../entities.js';

export type AccountSessionRepository = {
  create: (session: AccountSession) => Promise<AccountSession>;
  findByTokenHash: (tokenHash: string) => Promise<AccountSession | null>;
  findById: (input: { sessionId: string }) => Promise<AccountSession | null>;
  revoke: (input: { sessionId: string; revokedAt: Date }) => Promise<void>;
};
