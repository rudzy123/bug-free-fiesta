import { describe, expect, it } from 'vitest';
import { createObservabilityMetrics, statusClass } from './app-metrics.js';

describe('statusClass', () => {
  it('maps status codes to classes', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
    expect(statusClass(301)).toBe('3xx');
  });
});

describe('observability metrics registry', () => {
  it('records and renders all required product metrics', () => {
    const metrics = createObservabilityMetrics();
    metrics.recordHttpRequest({
      method: 'POST',
      route: '/auth/login',
      statusCode: 200,
      durationSeconds: 0.02,
    });
    metrics.recordHttpError({ method: 'POST', route: '/auth/login', code: 'rate_limited' });
    metrics.recordDbQuery({ operation: 'ping', outcome: 'ok', durationSeconds: 0.003 });
    metrics.recordObjectStorageError({ operation: 'get' });
    metrics.setQueueDepth({ pending: 3, processing: 1, failed: 0, expiredLeaseCount: 2 });
    metrics.recordJobAttempt({ type: 'flatten_signature' });
    metrics.recordJobDuration({
      type: 'flatten_signature',
      outcome: 'succeeded',
      durationSeconds: 0.5,
    });
    metrics.recordPdfFailure({ category: 'invalid_magic' });
    metrics.recordSigningCompletion({ outcome: 'completed' });
    metrics.recordAuditVerificationFailure();

    const output = metrics.render();
    for (const name of [
      'esign_http_request_duration_seconds',
      'esign_http_requests_total',
      'esign_http_errors_total',
      'esign_db_query_duration_seconds',
      'esign_object_storage_errors_total',
      'esign_queue_depth',
      'esign_job_attempts_total',
      'esign_job_duration_seconds',
      'esign_pdf_failures_total',
      'esign_signing_completions_total',
      'esign_audit_verification_failures_total',
    ]) {
      expect(output).toContain(name);
    }
    expect(output).toContain('esign_queue_depth{state="pending"} 3');
    expect(output).toContain('esign_queue_depth{state="expired_leases"} 2');
    expect(output).toContain(
      'esign_http_errors_total{method="POST",route="/auth/login",code="rate_limited"} 1',
    );
    expect(output).toContain('esign_signing_completions_total{outcome="completed"} 1');
  });
});
