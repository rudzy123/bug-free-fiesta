import { describe, expect, it } from 'vitest';
import { createHealthService } from './health-service.js';

describe('health service', () => {
  it('reports ready when ping succeeds', async () => {
    const health = createHealthService({ ping: async () => undefined });
    await expect(health.live()).resolves.toBeUndefined();
    await expect(health.ready()).resolves.toEqual({ ready: true, database: 'up' });
  });

  it('reports not ready when ping fails', async () => {
    const health = createHealthService({
      ping: async () => {
        throw new Error('down');
      },
    });
    await expect(health.ready()).resolves.toEqual({ ready: false, database: 'down' });
  });
});
