import { describe, expect, it } from 'vitest';
import { isJobQueueStale, type JobQueueDepth } from './job-queue.js';

function depth(overrides: Partial<JobQueueDepth> = {}): JobQueueDepth {
  return {
    pending: 0,
    processing: 0,
    failed: 0,
    expiredLeaseCount: 0,
    oldestAvailableAt: null,
    ...overrides,
  };
}

describe('isJobQueueStale', () => {
  const now = new Date('2026-08-19T12:00:00.000Z');

  it('is stale when claimable work is older than the threshold', () => {
    expect(
      isJobQueueStale({
        depth: depth({
          pending: 1,
          oldestAvailableAt: new Date('2026-08-19T11:57:00.000Z'),
        }),
        now,
        staleAfterMs: 120_000,
      }),
    ).toBe(true);
  });

  it('is stale when expired leases have not been recovered', () => {
    expect(
      isJobQueueStale({
        depth: depth({ expiredLeaseCount: 1 }),
        now,
        staleAfterMs: 120_000,
      }),
    ).toBe(true);
  });

  it('is not stale when the queue is empty', () => {
    expect(isJobQueueStale({ depth: depth(), now, staleAfterMs: 120_000 })).toBe(false);
  });
});
