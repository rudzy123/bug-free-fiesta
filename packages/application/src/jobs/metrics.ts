import type { JobQueueDepth, JobQueueMetrics, JobQueueMetricsSnapshot } from '@esign/domain';

export function createMemoryJobQueueMetrics(): JobQueueMetrics {
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let expiredLeaseCount = 0;
  let claims = 0;
  let recoveredLeases = 0;
  let attempts = 0;
  let successes = 0;
  let retryableFailures = 0;
  let terminalFailures = 0;
  let lastLatencyMs: number | null = null;

  return {
    recordQueueDepth(depth: JobQueueDepth) {
      pending = depth.pending;
      processing = depth.processing;
      failed = depth.failed;
      expiredLeaseCount = depth.expiredLeaseCount;
    },
    recordClaim(input) {
      claims += 1;
      if (input.recoveredLease) {
        recoveredLeases += 1;
      }
    },
    recordAttempt() {
      attempts += 1;
    },
    recordSuccess(input) {
      successes += 1;
      lastLatencyMs = input.durationMs;
    },
    recordFailure(input) {
      if (input.terminal) {
        terminalFailures += 1;
      } else {
        retryableFailures += 1;
      }
    },
    recordLease() {
      return;
    },
    snapshot(): JobQueueMetricsSnapshot {
      return {
        pending,
        processing,
        failed,
        expiredLeaseCount,
        claims,
        recoveredLeases,
        attempts,
        successes,
        retryableFailures,
        terminalFailures,
        lastLatencyMs,
      };
    },
  };
}

export function createNoopJobQueueMetrics(): JobQueueMetrics {
  return createMemoryJobQueueMetrics();
}
