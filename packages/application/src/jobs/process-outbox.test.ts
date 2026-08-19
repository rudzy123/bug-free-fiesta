import { describe, expect, it } from 'vitest';
import {
  ExternalServiceError,
  ValidationError,
  type BackgroundJob,
  type Clock,
  type OutboxEvent,
} from '@esign/domain';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createMemoryOutboxClaimer } from './memory-claimer.js';
import { createMemoryJobQueueMetrics } from './metrics.js';
import {
  createOutboxJobProcessor,
  createSilentJobProcessLogger,
  type OutboxJobProcessor,
} from './process-outbox.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DOC = '44444444-4444-4444-8444-444444444444';
const REV = '88888888-8888-4888-8888-888888888888';
const OUTBOX = '99999999-9999-4999-8999-999999999999';
const JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const START = '2026-08-19T12:00:00.000Z';
const TYPE = 'inspect_document';

function clockAt(iso: string): Clock & { advanceMs: (ms: number) => void } {
  let current = new Date(iso);
  return {
    nowUtc: () => new Date(current.getTime()),
    advanceMs(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  const now = new Date(START);
  return {
    id: OUTBOX,
    organizationId: ORG,
    documentId: DOC,
    type: TYPE,
    status: 'pending',
    payload: { documentId: DOC, revisionId: REV },
    requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    attemptCount: 0,
    leaseOwner: null,
    leaseUntil: null,
    availableAt: now,
    processedAt: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function job(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  const now = new Date(START);
  return {
    id: JOB,
    organizationId: ORG,
    documentId: DOC,
    outboxEventId: OUTBOX,
    type: TYPE,
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 8,
    leaseOwner: null,
    leaseUntil: null,
    availableAt: now,
    lastErrorCode: null,
    requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function processor(input: { events: OutboxEvent[]; jobs?: BackgroundJob[]; clock?: Clock }): {
  runner: OutboxJobProcessor;
  claimer: ReturnType<typeof createMemoryOutboxClaimer>;
  metrics: ReturnType<typeof createMemoryJobQueueMetrics>;
  clock: Clock & { advanceMs?: (ms: number) => void };
} {
  const clock = input.clock ?? clockAt(START);
  const claimer = createMemoryOutboxClaimer({
    events: input.events,
    jobs: input.jobs ?? [job()],
  });
  const metrics = createMemoryJobQueueMetrics();
  const runner = createOutboxJobProcessor({
    claimer,
    clock,
    random: { next: () => 0 },
    metrics,
    backoff: { baseDelayMs: 1_000, maxDelayMs: 8_000 },
    leaseMs: 60_000,
    logger: createSilentJobProcessLogger(),
  });
  return { runner, claimer, metrics, clock };
}

describe('outbox job processor', () => {
  it('delivers at least once and is idle after success', async () => {
    const { runner, claimer, metrics } = processor({ events: [event()] });
    let runs = 0;
    const result = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => {
        runs += 1;
      },
    });
    expect(result.outcome).toBe('succeeded');
    expect(runs).toBe(1);
    expect(claimer.events[0]?.status).toBe('processed');
    expect(claimer.jobs[0]?.status).toBe('succeeded');
    expect(claimer.events[0]?.requestId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(metrics.snapshot().successes).toBe(1);

    const second = await runner.processNext({
      type: TYPE,
      owner: 'worker-b',
      handler: async () => {
        runs += 1;
      },
    });
    expect(second.outcome).toBe('idle');
    expect(runs).toBe(1);
  });

  it('treats duplicate handler invocation as a no-op when work is already done', async () => {
    const { runner } = processor({ events: [event()] });
    let sideEffects = 0;
    const handler = async () => {
      if (sideEffects === 0) {
        sideEffects = 1;
        return;
      }
    };
    await runner.processNext({ type: TYPE, owner: 'worker-a', handler });
    await handler({
      event: event({ status: 'processed' }),
      job: job({ status: 'succeeded' }),
      leaseRecovered: false,
    });
    expect(sideEffects).toBe(1);
  });

  it('retries after a crash following object upload and commits on the next attempt', async () => {
    const storage = createMemoryObjectStorage();
    const clock = clockAt(START);
    const { runner, claimer } = processor({ events: [event()], clock });
    let uploads = 0;
    let commits = 0;
    const handler = async () => {
      await storage.putObject({
        organizationId: ORG,
        key: `org/${ORG}/final/${DOC}`,
        body: new TextEncoder().encode('%PDF-1.4\n'),
        contentType: 'application/pdf',
      });
      uploads += 1;
      if (commits === 0 && uploads === 1) {
        throw new ExternalServiceError({ reason: 'crash_after_upload' });
      }
      commits += 1;
    };

    const first = await runner.processNext({ type: TYPE, owner: 'worker-a', handler });
    expect(first.outcome).toBe('retry_scheduled');
    expect(uploads).toBe(1);
    expect(commits).toBe(0);
    expect(claimer.events[0]?.status).toBe('pending');
    expect(claimer.events[0]?.lastErrorCode).toBe('retryable:external_service');

    const stored = await storage.getObject({
      organizationId: ORG,
      key: `org/${ORG}/final/${DOC}`,
    });
    expect(stored).not.toBeNull();

    clock.advanceMs(1_000);
    const second = await runner.processNext({ type: TYPE, owner: 'worker-b', handler });
    expect(second.outcome).toBe('succeeded');
    expect(uploads).toBe(2);
    expect(commits).toBe(1);
  });

  it('retries when the process crashes before the outbox commit', async () => {
    const inner = createMemoryOutboxClaimer({ events: [event()], jobs: [job()] });
    let failComplete = true;
    const claimer: typeof inner = {
      ...inner,
      events: inner.events,
      jobs: inner.jobs,
      markProcessed: async (input) => {
        if (failComplete) {
          failComplete = false;
          throw new Error('crash before outbox commit');
        }
        await inner.markProcessed(input);
      },
    };
    const clock = clockAt(START);
    const runner = createOutboxJobProcessor({
      claimer,
      clock,
      random: { next: () => 0 },
      metrics: createMemoryJobQueueMetrics(),
      backoff: { baseDelayMs: 1_000, maxDelayMs: 8_000 },
      leaseMs: 60_000,
      logger: createSilentJobProcessLogger(),
    });
    let handlerRuns = 0;
    const first = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => {
        handlerRuns += 1;
      },
    });
    expect(first.outcome).toBe('retry_scheduled');
    expect(handlerRuns).toBe(1);
    clock.advanceMs(1_000);
    const second = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => {
        handlerRuns += 1;
      },
    });
    expect(second.outcome).toBe('succeeded');
    expect(handlerRuns).toBe(2);
    expect(inner.events[0]?.status).toBe('processed');
  });

  it('recovers an expired processing lease', async () => {
    const now = new Date(START);
    const { runner, claimer, metrics } = processor({
      events: [
        event({
          status: 'processing',
          leaseOwner: 'crashed-worker',
          leaseUntil: new Date(now.getTime() - 1_000),
          attemptCount: 1,
        }),
      ],
      jobs: [
        job({
          status: 'leased',
          leaseOwner: 'crashed-worker',
          leaseUntil: new Date(now.getTime() - 1_000),
          attemptCount: 1,
        }),
      ],
    });
    const result = await runner.processNext({
      type: TYPE,
      owner: 'worker-b',
      handler: async () => undefined,
    });
    expect(result.outcome).toBe('succeeded');
    expect(result.claimed?.leaseRecovered).toBe(true);
    expect(claimer.events[0]?.leaseOwner).toBeNull();
    expect(metrics.snapshot().recoveredLeases).toBe(1);
  });

  it('dead-letters poison jobs without retrying', async () => {
    const { runner, claimer, metrics } = processor({ events: [event()] });
    const result = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => {
        throw new ValidationError({ reason: 'invalid_payload' });
      },
    });
    expect(result.outcome).toBe('dead_lettered');
    expect(claimer.events[0]?.status).toBe('failed');
    expect(claimer.jobs[0]?.status).toBe('failed');
    expect(claimer.events[0]?.lastErrorCode).toBe('non_retryable:validation');
    expect(metrics.snapshot().terminalFailures).toBe(1);
    const second = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => undefined,
    });
    expect(second.outcome).toBe('idle');
  });

  it('dead-letters after the attempt budget for retryable failures', async () => {
    const { runner, claimer } = processor({
      events: [event()],
      jobs: [job({ maxAttempts: 1 })],
    });
    const result = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => {
        throw new ExternalServiceError({ reason: 'storage' });
      },
    });
    expect(result.outcome).toBe('dead_lettered');
    expect(claimer.events[0]?.status).toBe('failed');
    expect(claimer.events[0]?.lastErrorCode).toBe('retryable:external_service');
  });

  it('does not claim work after graceful shutdown begins', async () => {
    const stopped = createOutboxJobProcessor({
      claimer: createMemoryOutboxClaimer({ events: [event()], jobs: [job()] }),
      clock: clockAt(START),
      random: { next: () => 0 },
      metrics: createMemoryJobQueueMetrics(),
      backoff: { baseDelayMs: 1_000, maxDelayMs: 8_000 },
      leaseMs: 60_000,
      logger: createSilentJobProcessLogger(),
      shouldStop: () => true,
    });
    const result = await stopped.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => undefined,
    });
    expect(result.outcome).toBe('idle');
    expect(result.claimed).toBeNull();
  });

  it('rejects queue payloads that are not opaque ids', async () => {
    const { runner, claimer } = processor({
      events: [event({ payload: { rawToken: 'super-secret-signing-token' } })],
    });
    const result = await runner.processNext({
      type: TYPE,
      owner: 'worker-a',
      handler: async () => undefined,
    });
    expect(result.outcome).toBe('dead_lettered');
    expect(claimer.events[0]?.status).toBe('failed');
  });
});
