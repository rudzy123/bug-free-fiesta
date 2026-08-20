import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { createObservabilityMetrics } from '@esign/observability';
import { apiEnv } from '@esign/test-utils';
import { createHealthService } from './application/health-service.js';
import { createApiApp } from './create-app.js';
import type { DatabasePinger } from '@esign/database';

function okPinger(): DatabasePinger {
  return { ping: async () => undefined };
}

function buildApp() {
  const config = loadApiConfig(apiEnv());
  const logger = createLogger({ name: 'obs-test', level: 'silent' });
  const metrics = createObservabilityMetrics();
  const app = createApiApp({
    config,
    logger,
    health: createHealthService(okPinger()),
    metrics,
    extraRoutes: (expressApp) => {
      expressApp.get('/boom', () => {
        throw new Error('internal detail');
      });
    },
  });
  return { app, metrics };
}

describe('API observability', () => {
  it('exposes a Prometheus /metrics endpoint with HTTP and DB metrics', async () => {
    const { app } = buildApp();
    await request(app).get('/health/live');
    await request(app).get('/health/ready');
    await request(app).get('/boom');

    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');

    const body = response.text;
    expect(body).toContain('esign_http_request_duration_seconds');
    expect(body).toContain('esign_http_requests_total');
    expect(body).toContain('esign_db_query_duration_seconds');
    // The thrown error is counted with its stable public error code.
    expect(body).toContain('code="internal"');
    // Route labels are templates, never raw ids, and never secrets.
    expect(body).not.toMatch(/token|authorization|cookie/i);
  });

  it('records readiness DB latency with an ok outcome', async () => {
    const { app, metrics } = buildApp();
    await request(app).get('/health/ready');
    expect(metrics.render()).toContain(
      'esign_db_query_duration_seconds_count{operation="readiness_ping",outcome="ok"} 1',
    );
  });
});
