import { describe, expect, it } from 'vitest';
import { createScheduledAuditVerificationPoll } from './process-audit-verification.js';

describe('scheduled audit verification poll', () => {
  it('runs once then skips until the interval elapses', async () => {
    let now = new Date('2026-08-19T12:00:00.000Z');
    let runs = 0;
    const poll = createScheduledAuditVerificationPoll({
      intervalMs: 60_000,
      now: () => now,
      run: async () => {
        runs += 1;
        return {
          organizationCount: 1,
          documentCount: 1,
          failedDocumentCount: 2,
          checkedAt: now.toISOString(),
        };
      },
    });
    expect(await poll()).toEqual({ jobsClaimed: 2 });
    expect(await poll()).toEqual({ jobsClaimed: 0 });
    now = new Date('2026-08-19T12:01:00.000Z');
    expect(await poll()).toEqual({ jobsClaimed: 2 });
    expect(runs).toBe(2);
  });
});
