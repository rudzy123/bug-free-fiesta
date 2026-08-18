import type { DatabasePinger } from '@esign/database';

export type HealthStatus = {
  ready: boolean;
  database: 'up' | 'down';
};

export function createHealthService(database: DatabasePinger) {
  return {
    async live(): Promise<void> {
      return;
    },
    async ready(): Promise<HealthStatus> {
      try {
        await database.ping();
        return { ready: true, database: 'up' };
      } catch {
        return { ready: false, database: 'down' };
      }
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
