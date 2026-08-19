import { describe, expect, it } from 'vitest';
import { computeBackoffMs } from './backoff.js';

describe('computeBackoffMs', () => {
  it('uses exponential delay with equal jitter', () => {
    const noJitter = { next: () => 0 };
    const fullJitter = { next: () => 0.999999999999 };
    const policy = { baseDelayMs: 1_000, maxDelayMs: 8_000 };

    expect(computeBackoffMs({ attemptCount: 1, policy, random: noJitter })).toBe(500);
    expect(computeBackoffMs({ attemptCount: 1, policy, random: fullJitter })).toBe(999);
    expect(computeBackoffMs({ attemptCount: 2, policy, random: noJitter })).toBe(1_000);
    expect(computeBackoffMs({ attemptCount: 4, policy, random: noJitter })).toBe(4_000);
    expect(computeBackoffMs({ attemptCount: 8, policy, random: noJitter })).toBe(4_000);
  });
});
