/**
 * Feature-flag evaluation port. Application code depends on this interface;
 * adapters live in `@esign/application`. Do not read environment variables here.
 */
export type FeatureFlagContext = {
  readonly tenantId?: string;
  readonly organizationId?: string;
  readonly actorId?: string;
};

export type FeatureFlagPort = {
  /**
   * Returns whether `key` is enabled for the optional context.
   * Unknown keys default to `false` (deny-by-default for new risky behavior).
   */
  isEnabled: (key: string, context?: FeatureFlagContext) => Promise<boolean>;
};
