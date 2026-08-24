import { describe, expect, it } from 'vitest';
import {
  createMemoryAuditVerificationMetrics,
  withAuditVerificationFailureHook,
} from './metrics.js';

describe('audit verification metrics', () => {
  it('increments the failure hook only when verification fails', () => {
    let failures = 0;
    const inner = createMemoryAuditVerificationMetrics();
    const metrics = withAuditVerificationFailureHook(inner, () => {
      failures += 1;
    });
    metrics.recordVerified({ ok: true, failureCodes: [] });
    metrics.recordVerified({ ok: false, failureCodes: ['HASH_MISMATCH'] });
    expect(failures).toBe(1);
    expect(metrics.snapshot().verifiedFailed).toBe(1);
    expect(metrics.snapshot().verifiedOk).toBe(1);
  });
});
