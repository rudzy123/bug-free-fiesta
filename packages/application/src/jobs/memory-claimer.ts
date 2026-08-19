import type {
  BackgroundJob,
  ClaimedOutboxWork,
  JobErrorCategory,
  OutboxClaimer,
  OutboxEvent,
} from '@esign/domain';
import { DEFAULT_JOB_MAX_ATTEMPTS } from '@esign/domain';

export type MemoryOutboxClaimer = OutboxClaimer & {
  events: OutboxEvent[];
  jobs: BackgroundJob[];
};

function cloneEvent(event: OutboxEvent): OutboxEvent {
  return { ...event, payload: { ...event.payload } };
}

function cloneJob(job: BackgroundJob): BackgroundJob {
  return { ...job };
}

export function createMemoryOutboxClaimer(
  seed: { events?: OutboxEvent[]; jobs?: BackgroundJob[] } = {},
): MemoryOutboxClaimer {
  const events = seed.events ? seed.events.map(cloneEvent) : [];
  const jobs = seed.jobs ? seed.jobs.map(cloneJob) : [];
  let chain: Promise<unknown> = Promise.resolve();

  const serialize = async <T>(work: () => T | Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const ensureJob = (event: OutboxEvent, now: Date): BackgroundJob => {
    const existing = jobs.find((row) => row.outboxEventId === event.id);
    if (existing) {
      return existing;
    }
    const created: BackgroundJob = {
      id: event.id,
      organizationId: event.organizationId,
      documentId: event.documentId,
      outboxEventId: event.id,
      type: event.type,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
      leaseOwner: null,
      leaseUntil: null,
      availableAt: event.availableAt,
      lastErrorCode: null,
      requestId: event.requestId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    jobs.push(created);
    return created;
  };

  return {
    events,
    jobs,
    async claimNextByType(input) {
      return serialize((): ClaimedOutboxWork | null => {
        const index = events.findIndex(
          (row) =>
            row.type === input.type &&
            row.availableAt.getTime() <= input.now.getTime() &&
            (row.status === 'pending' ||
              (row.status === 'processing' &&
                row.leaseUntil !== null &&
                row.leaseUntil.getTime() < input.now.getTime())),
        );
        const event = index >= 0 ? events[index] : undefined;
        if (event === undefined || index < 0) {
          return null;
        }
        const leaseRecovered = event.status === 'processing';
        const nextEvent: OutboxEvent = {
          ...event,
          status: 'processing',
          leaseOwner: input.owner,
          leaseUntil: input.leaseUntil,
          attemptCount: event.attemptCount + 1,
          updatedAt: input.now,
        };
        events[index] = nextEvent;
        const job = ensureJob(event, input.now);
        const jobIndex = jobs.findIndex((row) => row.id === job.id);
        const nextJob: BackgroundJob = {
          ...job,
          status: 'leased',
          leaseOwner: input.owner,
          leaseUntil: input.leaseUntil,
          attemptCount: job.attemptCount + 1,
          version: job.version + 1,
          updatedAt: input.now,
        };
        if (jobIndex >= 0) {
          jobs[jobIndex] = nextJob;
        }
        return { event: nextEvent, job: nextJob, leaseRecovered };
      });
    },
    async markProcessed(input) {
      return serialize(() => {
        const eventIndex = events.findIndex(
          (row) =>
            row.id === input.outboxEventId &&
            row.organizationId === input.organizationId &&
            row.leaseOwner === input.owner &&
            row.status === 'processing',
        );
        const event = eventIndex >= 0 ? events[eventIndex] : undefined;
        if (event === undefined || eventIndex < 0) {
          return;
        }
        events[eventIndex] = {
          ...event,
          status: 'processed',
          processedAt: input.processedAt,
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: input.processedAt,
        };
        const jobIndex = jobs.findIndex(
          (row) =>
            row.id === input.jobId &&
            row.organizationId === input.organizationId &&
            row.leaseOwner === input.owner &&
            row.status === 'leased',
        );
        const job = jobIndex >= 0 ? jobs[jobIndex] : undefined;
        if (job !== undefined && jobIndex >= 0) {
          jobs[jobIndex] = {
            ...job,
            status: 'succeeded',
            leaseOwner: null,
            leaseUntil: null,
            version: job.version + 1,
            updatedAt: input.processedAt,
          };
        }
      });
    },
    async scheduleRetry(input) {
      return serialize(() => {
        applyOutcome(events, jobs, input, 'pending', 'pending', input.availableAt);
      });
    },
    async markDeadLettered(input) {
      return serialize(() => {
        applyOutcome(events, jobs, input, 'failed', 'failed', undefined);
      });
    },
  };
}

function applyOutcome(
  events: OutboxEvent[],
  jobs: BackgroundJob[],
  input: {
    organizationId: string;
    outboxEventId: string;
    jobId: string;
    owner: string;
    errorCategory: JobErrorCategory;
    errorCode: string;
  },
  outboxStatus: OutboxEvent['status'],
  jobStatus: BackgroundJob['status'],
  availableAt: Date | undefined,
): void {
  const eventIndex = events.findIndex(
    (row) =>
      row.id === input.outboxEventId &&
      row.organizationId === input.organizationId &&
      row.leaseOwner === input.owner &&
      row.status === 'processing',
  );
  const event = eventIndex >= 0 ? events[eventIndex] : undefined;
  if (event === undefined || eventIndex < 0) {
    return;
  }
  const now = availableAt ?? event.updatedAt;
  events[eventIndex] = {
    ...event,
    status: outboxStatus,
    lastErrorCode: input.errorCode,
    leaseOwner: null,
    leaseUntil: null,
    availableAt: availableAt ?? event.availableAt,
    updatedAt: now,
  };
  const jobIndex = jobs.findIndex(
    (row) =>
      row.id === input.jobId &&
      row.organizationId === input.organizationId &&
      row.leaseOwner === input.owner,
  );
  const job = jobIndex >= 0 ? jobs[jobIndex] : undefined;
  if (job !== undefined && jobIndex >= 0) {
    jobs[jobIndex] = {
      ...job,
      status: jobStatus,
      lastErrorCode: input.errorCode,
      leaseOwner: null,
      leaseUntil: null,
      availableAt: availableAt ?? job.availableAt,
      version: job.version + 1,
      updatedAt: now,
    };
  }
}
