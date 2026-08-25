import type { FeatureFlagContext, FeatureFlagPort } from '@esign/domain';

/**
 * Static map adapter for tests and local defaults.
 * Missing keys → false.
 */
export function createStaticFeatureFlags(
  flags: Readonly<Record<string, boolean>>,
): FeatureFlagPort {
  return {
    async isEnabled(key: string, _context?: FeatureFlagContext): Promise<boolean> {
      return flags[key] === true;
    },
  };
}

/**
 * Environment-backed adapter. Keys map to `FEATURE_FLAG_<NORMALIZED>` where
 * normalization uppercases and replaces `.` / `-` with `_`.
 * Truthy: `1`, `true`, `yes`, `on` (case-insensitive). Everything else → false.
 * Callers should pass env from `packages/config` loaders, not raw globals in use cases.
 */
export function createEnvFeatureFlags(
  env: Readonly<Record<string, string | undefined>>,
): FeatureFlagPort {
  return {
    async isEnabled(key: string, _context?: FeatureFlagContext): Promise<boolean> {
      const envKey = `FEATURE_FLAG_${key.replace(/[.-]/g, '_').toUpperCase()}`;
      const raw = env[envKey];
      if (raw === undefined) {
        return false;
      }
      const normalized = raw.trim().toLowerCase();
      return (
        normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
      );
    },
  };
}
