import type { UnitIntervalRandom } from '../ports/services.js';

export type BackoffPolicy = {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

export function computeBackoffMs(input: {
  attemptCount: number;
  policy: BackoffPolicy;
  random: UnitIntervalRandom;
}): number {
  const attempt = Math.max(1, input.attemptCount);
  const exponential = Math.min(
    input.policy.maxDelayMs,
    input.policy.baseDelayMs * 2 ** (attempt - 1),
  );
  const unit = clampUnitInterval(input.random.next());
  return Math.floor(exponential / 2 + unit * (exponential / 2));
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value >= 1) {
    return 0.999999999999;
  }
  return value;
}
