import type { Clock, RateLimitDecision, RateLimiter } from '@esign/domain';

export function createMemoryRateLimiter(options: {
  max: number;
  windowMs: number;
  clock: Clock;
}): RateLimiter {
  const buckets = new Map<string, { count: number; windowStartMs: number }>();

  return {
    async consume(key: string): Promise<RateLimitDecision> {
      const nowMs = options.clock.nowUtc().getTime();
      const existing = buckets.get(key);
      if (!existing || nowMs - existing.windowStartMs >= options.windowMs) {
        buckets.set(key, { count: 1, windowStartMs: nowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (existing.count >= options.max) {
        const retryAfterMs = options.windowMs - (nowMs - existing.windowStartMs);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
