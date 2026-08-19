import { describe, expect, it } from 'vitest';
import { createLogger } from '@esign/logger';
import { createMemoryJobQueueMetrics } from '@esign/application';
import { createWorkerHealthServer } from './health-server.js';

describe('worker health server', () => {
  it('reports a stale queue without claiming secrets', async () => {
    const poller = {
      start() {
        return;
      },
      async stop() {
        return;
      },
      isRunning: () => true,
      lastPollAtUtc: () => new Date('2026-08-19T12:00:00.000Z'),
    };
    const oldest = new Date('2026-08-19T11:00:00.000Z');
    const server = createWorkerHealthServer({
      host: '127.0.0.1',
      port: 0,
      logger: createLogger({ name: 'health-test', level: 'silent' }),
      poller,
      database: { ping: async () => undefined },
      queueHealth: {
        async snapshot() {
          return {
            pending: 2,
            processing: 0,
            failed: 1,
            expiredLeaseCount: 1,
            oldestAvailableAt: oldest,
          };
        },
      },
      metrics: createMemoryJobQueueMetrics(),
      clock: { nowUtc: () => new Date('2026-08-19T12:00:00.000Z') },
      staleAfterMs: 120_000,
      pollStaleAfterMs: 15_000,
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected tcp address');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    const body = (await response.json()) as {
      checks: { queue: string };
      queue: { stale: boolean; failed: number; expiredLeases: number };
    };
    expect(response.status).toBe(200);
    expect(body.checks.queue).toBe('stale');
    expect(body.queue.stale).toBe(true);
    expect(body.queue.failed).toBe(1);
    expect(body.queue.expiredLeases).toBe(1);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
