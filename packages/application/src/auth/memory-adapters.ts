import type {
  AccountSecurityAuditWriter,
  AccountSession,
  AccountSessionRepository,
  AccountUser,
  MembershipRepository,
  NewAccountSecurityEvent,
  OrganizationMembership,
  UserRepository,
} from '@esign/domain';

export type MemoryUserRepository = UserRepository & {
  add: (user: AccountUser) => void;
  setMemberships: (userId: string, memberships: OrganizationMembership[]) => void;
};

export function createMemoryUserRepository(users: AccountUser[] = []): MemoryUserRepository {
  const byId = new Map(users.map((user) => [user.id, user]));
  const membershipsByUser = new Map<string, OrganizationMembership[]>();

  return {
    add(user) {
      byId.set(user.id, user);
    },
    setMemberships(userId, memberships) {
      membershipsByUser.set(userId, memberships);
    },
    async findById(input) {
      return byId.get(input.userId) ?? null;
    },
    async findByEmail(input) {
      const email = input.email.trim().toLowerCase();
      return [...byId.values()].find((user) => user.email === email) ?? null;
    },
    async listMemberships(input) {
      return membershipsByUser.get(input.userId) ?? [];
    },
  };
}

export type MemoryMembershipRepository = MembershipRepository & {
  add: (membership: OrganizationMembership) => void;
};

export function createMemoryMembershipRepository(
  memberships: OrganizationMembership[] = [],
): MemoryMembershipRepository {
  const rows = [...memberships];
  return {
    add(membership) {
      rows.push(membership);
    },
    async findById(input) {
      return (
        rows.find(
          (row) => row.organizationId === input.organizationId && row.id === input.membershipId,
        ) ?? null
      );
    },
    async findByUser(input) {
      return (
        rows.find(
          (row) => row.organizationId === input.organizationId && row.userId === input.userId,
        ) ?? null
      );
    },
  };
}

export type MemoryAccountSessionRepository = AccountSessionRepository & {
  records: AccountSession[];
};

export function createMemoryAccountSessionRepository(): MemoryAccountSessionRepository {
  const records: AccountSession[] = [];
  return {
    records,
    async create(session) {
      records.push(session);
      return session;
    },
    async findByTokenHash(tokenHash) {
      return records.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async findById(input) {
      return records.find((row) => row.id === input.sessionId) ?? null;
    },
    async revoke(input) {
      const index = records.findIndex((row) => row.id === input.sessionId);
      const current = records[index];
      if (index === -1 || current === undefined) {
        return;
      }
      records[index] = { ...current, revokedAt: input.revokedAt };
    },
  };
}

export type MemoryAccountSecurityAuditWriter = AccountSecurityAuditWriter & {
  events: NewAccountSecurityEvent[];
};

export function createMemoryAccountSecurityAuditWriter(): MemoryAccountSecurityAuditWriter {
  const events: NewAccountSecurityEvent[] = [];
  return {
    events,
    async append(event) {
      events.push(event);
    },
  };
}
