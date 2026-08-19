import type { BackgroundJob, OutboxEvent } from '../entities.js';

export type JobCorrelation = {
  readonly correlationId: string;
  readonly requestId: string | null;
  readonly outboxEventId: string;
  readonly jobId: string;
  readonly documentId: string | null;
  readonly organizationId: string;
};

export function jobCorrelation(input: { event: OutboxEvent; job: BackgroundJob }): JobCorrelation {
  return {
    correlationId: input.event.requestId ?? input.event.id,
    requestId: input.event.requestId,
    outboxEventId: input.event.id,
    jobId: input.job.id,
    documentId: input.event.documentId,
    organizationId: input.event.organizationId,
  };
}
