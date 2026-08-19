import {
  assertSafeJobPayload,
  classifyJobFailure,
  computeBackoffMs,
  formatJobErrorCode,
  jobCorrelation,
  type BackoffPolicy,
  type Clock,
  type OutboxClaimer,
  type OutboxJobHandler,
  type JobQueueMetrics,
  type UnitIntervalRandom,
  type ClaimedOutboxWork,
} from '@esign/domain';

export type JobProcessLogger = {
  info: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
  error: (fields: Readonly<Record<string, unknown>>, message: string) => void;
};

export type ProcessOutboxResult = {
  readonly outcome: 'idle' | 'succeeded' | 'retry_scheduled' | 'dead_lettered';
  readonly claimed: ClaimedOutboxWork | null;
};

export type OutboxJobProcessor = {
  processNext: (input: {
    type: string;
    owner: string;
    handler: OutboxJobHandler;
  }) => Promise<ProcessOutboxResult>;
};

export function createSilentJobProcessLogger(): JobProcessLogger {
  return {
    info() {
      return;
    },
    warn() {
      return;
    },
    error() {
      return;
    },
  };
}

export function createOutboxJobProcessor(deps: {
  claimer: OutboxClaimer;
  clock: Clock;
  random: UnitIntervalRandom;
  metrics: JobQueueMetrics;
  backoff: BackoffPolicy;
  leaseMs: number;
  logger: JobProcessLogger;
  shouldStop?: () => boolean;
}): OutboxJobProcessor {
  return {
    async processNext(input) {
      if (deps.shouldStop?.()) {
        return { outcome: 'idle', claimed: null };
      }
      const now = deps.clock.nowUtc();
      const claimed = await deps.claimer.claimNextByType({
        type: input.type,
        now,
        owner: input.owner,
        leaseUntil: new Date(now.getTime() + deps.leaseMs),
      });
      if (!claimed) {
        return { outcome: 'idle', claimed: null };
      }

      const correlation = jobCorrelation(claimed);
      deps.metrics.recordClaim({ type: input.type, recoveredLease: claimed.leaseRecovered });
      deps.metrics.recordAttempt({ type: input.type, attemptCount: claimed.event.attemptCount });
      deps.metrics.recordLease({
        type: input.type,
        action: claimed.leaseRecovered ? 'expired_recovered' : 'acquired',
      });
      deps.logger.info(correlation, 'outbox job claimed');
      const started = deps.clock.nowUtc();

      try {
        assertSafeJobPayload(claimed.event.payload);
        await input.handler(claimed);
        const processedAt = deps.clock.nowUtc();
        await deps.claimer.markProcessed({
          organizationId: claimed.event.organizationId,
          outboxEventId: claimed.event.id,
          jobId: claimed.job.id,
          owner: input.owner,
          processedAt,
        });
        deps.metrics.recordSuccess({
          type: input.type,
          durationMs: processedAt.getTime() - started.getTime(),
          attemptCount: claimed.event.attemptCount,
        });
        deps.metrics.recordLease({ type: input.type, action: 'released' });
        deps.logger.info(correlation, 'outbox job processed');
        return { outcome: 'succeeded', claimed };
      } catch (error: unknown) {
        const classified = classifyJobFailure(error);
        const terminal =
          !classified.retryable || claimed.event.attemptCount >= claimed.job.maxAttempts;
        const errorCode = formatJobErrorCode(classified.category, classified.code);
        deps.logger.warn(
          {
            ...correlation,
            errorCategory: classified.category,
            errorKind: classified.code,
            terminal,
            attemptCount: claimed.event.attemptCount,
          },
          'outbox job failed',
        );
        if (terminal) {
          await deps.claimer.markDeadLettered({
            organizationId: claimed.event.organizationId,
            outboxEventId: claimed.event.id,
            jobId: claimed.job.id,
            owner: input.owner,
            errorCategory: classified.category,
            errorCode,
            failedAt: deps.clock.nowUtc(),
          });
          deps.metrics.recordFailure({
            type: input.type,
            category: classified.category,
            terminal: true,
            attemptCount: claimed.event.attemptCount,
          });
          return { outcome: 'dead_lettered', claimed };
        }
        const delayMs = computeBackoffMs({
          attemptCount: claimed.event.attemptCount,
          policy: deps.backoff,
          random: deps.random,
        });
        await deps.claimer.scheduleRetry({
          organizationId: claimed.event.organizationId,
          outboxEventId: claimed.event.id,
          jobId: claimed.job.id,
          owner: input.owner,
          errorCategory: classified.category,
          errorCode,
          availableAt: new Date(deps.clock.nowUtc().getTime() + delayMs),
        });
        deps.metrics.recordFailure({
          type: input.type,
          category: classified.category,
          terminal: false,
          attemptCount: claimed.event.attemptCount,
        });
        return { outcome: 'retry_scheduled', claimed };
      }
    },
  };
}
