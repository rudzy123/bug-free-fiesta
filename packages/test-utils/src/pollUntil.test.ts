import { describe, expect, it } from 'vitest';
import { pollUntil } from './index.js';

describe('pollUntil', () => {
  it('returns when the predicate matches before the deadline', async () => {
    let value = 0;
    const result = await pollUntil(
      async () => {
        value += 1;
        return value;
      },
      (current) => current >= 3,
      { timeoutMs: 1_000, intervalMs: 1, message: 'never reached 3' },
    );
    expect(result).toBe(3);
  });

  it('throws the provided message when the deadline elapses', async () => {
    await expect(
      pollUntil(
        async () => 0,
        () => false,
        {
          timeoutMs: 20,
          intervalMs: 5,
          message: 'still zero',
        },
      ),
    ).rejects.toThrow('still zero');
  });
});
