import type { JobQueueMetrics } from '@esign/domain';
import type { ObservabilityMetrics } from '@esign/observability';

/**
 * Wraps the in-process JobQueueMetrics so every recorded event is also emitted
 * to the Prometheus registry: job attempts, per-type job duration on success and
 * failure (finalization duration is the `flatten_signature` type), and queue
 * depth by state. The wrapped instance keeps its own snapshot for the worker
 * `/health/ready` body; the registry powers scraping and dashboards.
 */
export function withObservability(
  base: JobQueueMetrics,
  observability: ObservabilityMetrics,
): JobQueueMetrics {
  return {
    recordQueueDepth: (depth) => {
      base.recordQueueDepth(depth);
      observability.setQueueDepth({
        pending: depth.pending,
        processing: depth.processing,
        failed: depth.failed,
        expiredLeaseCount: depth.expiredLeaseCount,
      });
    },
    recordClaim: (input) => base.recordClaim(input),
    recordAttempt: (input) => {
      base.recordAttempt(input);
      observability.recordJobAttempt({ type: input.type });
    },
    recordSuccess: (input) => {
      base.recordSuccess(input);
      observability.recordJobDuration({
        type: input.type,
        outcome: 'succeeded',
        durationSeconds: input.durationMs / 1000,
      });
    },
    recordFailure: (input) => {
      base.recordFailure(input);
      observability.recordJobDuration({
        type: input.type,
        outcome: 'failed',
        durationSeconds: 0,
      });
    },
    recordLease: (input) => base.recordLease(input),
    snapshot: () => base.snapshot(),
  };
}
