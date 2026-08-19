import type { BackgroundJob, JobErrorCategory, OutboxEvent } from '../entities.js';

export type ClaimedOutboxWork = {
  readonly event: OutboxEvent;
  readonly job: BackgroundJob;
  readonly leaseRecovered: boolean;
};

export type OutboxClaimer = {
  claimNextByType: (input: {
    type: string;
    now: Date;
    owner: string;
    leaseUntil: Date;
  }) => Promise<ClaimedOutboxWork | null>;
  markProcessed: (input: {
    organizationId: string;
    outboxEventId: string;
    jobId: string;
    owner: string;
    processedAt: Date;
  }) => Promise<void>;
  scheduleRetry: (input: {
    organizationId: string;
    outboxEventId: string;
    jobId: string;
    owner: string;
    errorCategory: JobErrorCategory;
    errorCode: string;
    availableAt: Date;
  }) => Promise<void>;
  markDeadLettered: (input: {
    organizationId: string;
    outboxEventId: string;
    jobId: string;
    owner: string;
    errorCategory: JobErrorCategory;
    errorCode: string;
    failedAt: Date;
  }) => Promise<void>;
};

export type JobQueueDepth = {
  readonly pending: number;
  readonly processing: number;
  readonly failed: number;
  readonly expiredLeaseCount: number;
  readonly oldestAvailableAt: Date | null;
};

export type JobQueueHealth = {
  snapshot: (now: Date) => Promise<JobQueueDepth>;
};

export function isJobQueueStale(input: {
  depth: JobQueueDepth;
  now: Date;
  staleAfterMs: number;
}): boolean {
  if (input.depth.expiredLeaseCount > 0) {
    return true;
  }
  if (input.depth.oldestAvailableAt === null) {
    return false;
  }
  return input.now.getTime() - input.depth.oldestAvailableAt.getTime() >= input.staleAfterMs;
}

export type JobQueueMetricsSnapshot = {
  readonly pending: number;
  readonly processing: number;
  readonly failed: number;
  readonly expiredLeaseCount: number;
  readonly claims: number;
  readonly recoveredLeases: number;
  readonly attempts: number;
  readonly successes: number;
  readonly retryableFailures: number;
  readonly terminalFailures: number;
  readonly lastLatencyMs: number | null;
};

export type JobQueueMetrics = {
  recordQueueDepth: (depth: JobQueueDepth) => void;
  recordClaim: (input: { type: string; recoveredLease: boolean }) => void;
  recordAttempt: (input: { type: string; attemptCount: number }) => void;
  recordSuccess: (input: { type: string; durationMs: number; attemptCount: number }) => void;
  recordFailure: (input: {
    type: string;
    category: JobErrorCategory;
    terminal: boolean;
    attemptCount: number;
  }) => void;
  recordLease: (input: {
    type: string;
    action: 'acquired' | 'released' | 'expired_recovered';
  }) => void;
  snapshot: () => JobQueueMetricsSnapshot;
};

export type OutboxJobHandler = (claimed: ClaimedOutboxWork) => Promise<void>;
