export type RateLimitDecision = {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
};

export type RateLimiter = {
  consume: (key: string) => Promise<RateLimitDecision>;
};
