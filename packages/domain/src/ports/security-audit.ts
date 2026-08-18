import type { AccountSecurityEventType } from '../entities.js';

export type NewAccountSecurityEvent = {
  readonly id: string;
  readonly type: AccountSecurityEventType;
  readonly actorUserId?: string | null;
  readonly sessionId?: string | null;
  readonly requestId?: string | null;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type AccountSecurityAuditWriter = {
  append: (event: NewAccountSecurityEvent) => Promise<void>;
};
