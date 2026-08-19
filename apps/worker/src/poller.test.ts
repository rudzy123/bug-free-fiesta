import { describe, expect, it } from 'vitest';
import { createLogger } from '@esign/logger';
import { createJobPoller } from './poller.js';

describe('job poller', () => {
  it('starts, polls the placeholder boundary, and stops', async () => {
    let polls = 0;
    const poller = createJobPoller({
      intervalMs: 20,
      logger: createLogger({ name: 'worker-test', level: 'silent' }),
      poll: async () => {
        polls += 1;
      },
    });

    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(poller.isRunning()).toBe(true);
    await poller.stop();
    expect(poller.isRunning()).toBe(false);
    expect(polls).toBeGreaterThan(0);
    expect(poller.lastPollAtUtc()).toBeInstanceOf(Date);
  });

  it('waits for an in-flight poll before stop resolves', async () => {
    let release!: () => void;
    const blocking = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pollStarted = false;
    const poller = createJobPoller({
      intervalMs: 10_000,
      logger: createLogger({ name: 'worker-test', level: 'silent' }),
      poll: async () => {
        pollStarted = true;
        await blocking;
      },
    });
    poller.start();
    while (!pollStarted) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    let stopped = false;
    const stopping = poller.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(poller.isRunning()).toBe(false);
  });
});
