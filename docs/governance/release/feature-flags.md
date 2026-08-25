# Feature flags

## Abstraction

Runtime flags go through the `FeatureFlagPort` in `@esign/domain` / `@esign/application`. Do **not** scatter `process.env.FEATURE_*` reads outside `packages/config` and flag adapters.

```typescript
import type { FeatureFlagPort } from '@esign/domain';

await flags.isEnabled('safe_rollout.example', { tenantId });
```

- Keys are stable snake_or_dot strings, documented when introduced.
- Default is **off** for new risky behavior unless the flag is an explicit kill-switch (document which).
- Evaluation may use static maps (local/CI) or environment-backed adapters; never hardcode secrets in flag payloads.

## Safe rollout guidance

1. Ship dark: code behind a flag, default off.
2. Enable for internal/canary tenants.
3. Expand cohort; watch error rates, latency, queue depth, audit write failures.
4. Remove the old path only after the flag is permanently on and the deprecation window allows.
5. Prefer flags for **behavior**, not for skipping authorization or audit.

See [rollout-and-rollback.md](rollout-and-rollback.md) for deploy patterns.
