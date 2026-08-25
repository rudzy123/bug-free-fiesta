import { describe, expect, it } from 'vitest';
import { createEnvFeatureFlags, createStaticFeatureFlags } from './adapters.js';

describe('createStaticFeatureFlags', () => {
  it('returns true only for explicitly enabled keys', async () => {
    const flags = createStaticFeatureFlags({ 'safe_rollout.example': true });
    await expect(flags.isEnabled('safe_rollout.example')).resolves.toBe(true);
    await expect(flags.isEnabled('unknown')).resolves.toBe(false);
  });
});

describe('createEnvFeatureFlags', () => {
  it('reads FEATURE_FLAG_* with normalized keys', async () => {
    const flags = createEnvFeatureFlags({
      FEATURE_FLAG_SAFE_ROLLOUT_EXAMPLE: 'true',
      FEATURE_FLAG_OTHER: '0',
    });
    await expect(flags.isEnabled('safe_rollout.example')).resolves.toBe(true);
    await expect(flags.isEnabled('other')).resolves.toBe(false);
    await expect(flags.isEnabled('missing')).resolves.toBe(false);
  });
});
