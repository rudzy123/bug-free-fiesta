import {
  createMetricsRegistry,
  DEFAULT_DURATION_BUCKETS_SECONDS,
  type MetricsRegistry,
} from './metrics.js';

/**
 * The concrete set of product metrics required for production observability.
 * Names follow Prometheus conventions (`esign_*`, base units in seconds). All
 * labels are bounded, non-sensitive dimensions.
 */
export type ObservabilityMetrics = {
  readonly registry: MetricsRegistry;
  readonly recordHttpRequest: (input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }) => void;
  readonly recordHttpError: (input: { method: string; route: string; code: string }) => void;
  readonly recordDbQuery: (input: {
    operation: string;
    outcome: 'ok' | 'error';
    durationSeconds: number;
  }) => void;
  readonly recordObjectStorageError: (input: { operation: string }) => void;
  readonly setQueueDepth: (input: {
    pending: number;
    processing: number;
    failed: number;
    expiredLeaseCount: number;
  }) => void;
  readonly recordJobAttempt: (input: { type: string }) => void;
  readonly recordJobDuration: (input: {
    type: string;
    outcome: 'succeeded' | 'failed';
    durationSeconds: number;
  }) => void;
  readonly recordPdfFailure: (input: { category: string }) => void;
  readonly recordSigningCompletion: (input: {
    outcome: 'completed' | 'declined' | 'expired';
  }) => void;
  readonly recordAuditVerificationFailure: () => void;
  readonly render: () => string;
};

export function statusClass(statusCode: number): string {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return '1xx';
}

export function createObservabilityMetrics(
  registry: MetricsRegistry = createMetricsRegistry(),
): ObservabilityMetrics {
  const httpDuration = registry.histogram({
    name: 'esign_http_request_duration_seconds',
    help: 'HTTP request duration in seconds by route template and status class.',
    labelNames: ['method', 'route', 'status_class'],
    buckets: DEFAULT_DURATION_BUCKETS_SECONDS,
  });
  const httpRequests = registry.counter({
    name: 'esign_http_requests_total',
    help: 'Total HTTP requests by route template and status class.',
    labelNames: ['method', 'route', 'status_class'],
  });
  const httpErrors = registry.counter({
    name: 'esign_http_errors_total',
    help: 'Total HTTP error responses by route template and error code.',
    labelNames: ['method', 'route', 'code'],
  });
  const dbDuration = registry.histogram({
    name: 'esign_db_query_duration_seconds',
    help: 'Database query/ping duration in seconds by operation and outcome.',
    labelNames: ['operation', 'outcome'],
    buckets: DEFAULT_DURATION_BUCKETS_SECONDS,
  });
  const storageErrors = registry.counter({
    name: 'esign_object_storage_errors_total',
    help: 'Total object-storage operation errors by operation.',
    labelNames: ['operation'],
  });
  const queueDepth = registry.gauge({
    name: 'esign_queue_depth',
    help: 'Outbox/job queue depth by state.',
    labelNames: ['state'],
  });
  const jobAttempts = registry.counter({
    name: 'esign_job_attempts_total',
    help: 'Total background job attempts by job type.',
    labelNames: ['type'],
  });
  const jobDuration = registry.histogram({
    name: 'esign_job_duration_seconds',
    help: 'Background job processing duration in seconds by type and outcome (finalization = flatten_signature).',
    labelNames: ['type', 'outcome'],
    buckets: DEFAULT_DURATION_BUCKETS_SECONDS,
  });
  const pdfFailures = registry.counter({
    name: 'esign_pdf_failures_total',
    help: 'Total PDF processing failures by category.',
    labelNames: ['category'],
  });
  const signingCompletions = registry.counter({
    name: 'esign_signing_completions_total',
    help: 'Total signing session terminal outcomes.',
    labelNames: ['outcome'],
  });
  const auditVerificationFailures = registry.counter({
    name: 'esign_audit_verification_failures_total',
    help: 'Total audit-chain verification failures (should always be zero).',
  });

  return {
    registry,
    recordHttpRequest: ({ method, route, statusCode, durationSeconds }) => {
      const labels = { method, route, status_class: statusClass(statusCode) };
      httpDuration.observe(durationSeconds, labels);
      httpRequests.inc(labels);
    },
    recordHttpError: ({ method, route, code }) => {
      httpErrors.inc({ method, route, code });
    },
    recordDbQuery: ({ operation, outcome, durationSeconds }) => {
      dbDuration.observe(durationSeconds, { operation, outcome });
    },
    recordObjectStorageError: ({ operation }) => {
      storageErrors.inc({ operation });
    },
    setQueueDepth: ({ pending, processing, failed, expiredLeaseCount }) => {
      queueDepth.set(pending, { state: 'pending' });
      queueDepth.set(processing, { state: 'processing' });
      queueDepth.set(failed, { state: 'failed' });
      queueDepth.set(expiredLeaseCount, { state: 'expired_leases' });
    },
    recordJobAttempt: ({ type }) => {
      jobAttempts.inc({ type });
    },
    recordJobDuration: ({ type, outcome, durationSeconds }) => {
      jobDuration.observe(durationSeconds, { type, outcome });
    },
    recordPdfFailure: ({ category }) => {
      pdfFailures.inc({ category });
    },
    recordSigningCompletion: ({ outcome }) => {
      signingCompletions.inc({ outcome });
    },
    recordAuditVerificationFailure: () => {
      auditVerificationFailures.inc();
    },
    render: () => registry.render(),
  };
}
