import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import { PUBLIC_ERROR_MESSAGES } from '@esign/application';
import {
  errorEnvelopeSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from '@esign/contracts';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  IntegrityError,
  InvalidStateTransitionError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@esign/domain';
import { createHealthService } from './application/health-service.js';
import { createApiApp } from './create-app.js';
import type { DatabasePinger } from '@esign/database';

function pinger(ok: boolean): DatabasePinger {
  return {
    ping: async () => {
      if (!ok) {
        throw new Error('database unavailable');
      }
    },
  };
}

function testApp(
  databaseOk = true,
  extraRoutes?: Parameters<typeof createApiApp>[0]['extraRoutes'],
) {
  const config = loadApiConfig(apiEnv());
  const logger = createLogger({ name: 'api-test', level: 'silent' });
  const health = createHealthService(pinger(databaseOk));
  return {
    config,
    app: createApiApp({ config, logger, health, extraRoutes }),
  };
}

describe('API liveness', () => {
  it('returns ok without checking the database', async () => {
    const { app, config } = testApp(false);
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    const body = livenessResponseSchema.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
    expect(response.headers[config.CORRELATION_ID_HEADER]).toBe(body.correlationId);
  });

  it('exposes GET /health as liveness', async () => {
    const { app } = testApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(livenessResponseSchema.parse(response.body).status).toBe('ok');
  });
});

describe('API readiness', () => {
  it('returns ready when the database pings', async () => {
    const { app } = testApp(true);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    const body = readinessResponseSchema.parse(response.body);
    expect(body.status).toBe('ready');
    expect(body.checks.database).toBe('up');
  });

  it('returns not_ready when the database ping fails', async () => {
    const { app } = testApp(false);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    const envelope = errorEnvelopeSchema.parse({
      error: {
        code: response.body.error.code,
        message: response.body.error.message,
        correlationId: response.body.error.correlationId,
      },
    });
    expect(envelope.error.code).toBe('not_ready');
    expect(response.body.checks.database).toBe('down');
  });
});

describe('request ID generation and propagation', () => {
  it('generates a correlation id when the client omits one', async () => {
    const { app, config } = testApp();
    const response = await request(app).get('/health/live');
    const header = response.headers[config.CORRELATION_ID_HEADER];
    expect(header).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.body.correlationId).toBe(header);
  });

  it('propagates a safe incoming correlation id', async () => {
    const { app, config } = testApp();
    const incoming = 'req-client-correlation-01';
    const response = await request(app)
      .get('/health/live')
      .set(config.CORRELATION_ID_HEADER, incoming);
    expect(response.headers[config.CORRELATION_ID_HEADER]).toBe(incoming);
    expect(response.body.correlationId).toBe(incoming);
  });

  it('rejects an unsafe incoming header and generates a new id', async () => {
    const { app, config } = testApp();
    const response = await request(app)
      .get('/health/live')
      .set(config.CORRELATION_ID_HEADER, 'Bearer stolen-token');
    expect(response.headers[config.CORRELATION_ID_HEADER]).not.toBe('Bearer stolen-token');
    expect(response.body.correlationId).toBe(response.headers[config.CORRELATION_ID_HEADER]);
  });
});

describe('error response envelope', () => {
  it('returns a strict envelope for unknown routes', async () => {
    const { app, config } = testApp();
    const response = await request(app)
      .get('/does-not-exist')
      .set(config.CORRELATION_ID_HEADER, 'error-envelope-test-id');
    expect(response.status).toBe(404);
    const body = errorEnvelopeSchema.parse(response.body);
    expect(body.error.code).toBe('not_found');
    expect(body.error.correlationId).toBe('error-envelope-test-id');
    expect(body.error.message).not.toMatch(/stack/i);
  });

  it('hides internal error details from the client', async () => {
    const { app } = testApp(true, (expressApp) => {
      expressApp.get('/boom', () => {
        throw new Error('secret internals');
      });
    });
    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    const body = errorEnvelopeSchema.parse(response.body);
    expect(body.error.code).toBe('internal');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(response.body)).not.toContain('secret internals');
  });

  it('maps typed application errors to stable public envelopes', async () => {
    const { app } = testApp(true, (expressApp) => {
      expressApp.get('/validation', () => {
        throw new ValidationError({ field: 'title' });
      });
      expressApp.get('/authentication', () => {
        throw new AuthenticationError({ reason: 'missing_session' });
      });
      expressApp.get('/forbidden', () => {
        throw new AuthorizationError({ reason: 'role_denied' });
      });
      expressApp.get('/missing', () => {
        throw new NotFoundError({ resource: 'document' });
      });
      expressApp.get('/conflict', () => {
        throw new ConflictError({ version: 2 });
      });
      expressApp.get('/state', () => {
        throw new InvalidStateTransitionError({ from: 'finalized', to: 'draft' });
      });
      expressApp.get('/rate', () => {
        throw new RateLimitError({ retryAfterSeconds: 15 });
      });
      expressApp.get('/integrity', () => {
        throw new IntegrityError({ reason: 'audit_hash_mismatch' });
      });
    });

    const cases = [
      ['/validation', 400, 'validation'],
      ['/authentication', 401, 'authentication'],
      ['/forbidden', 403, 'forbidden'],
      ['/missing', 404, 'not_found'],
      ['/conflict', 409, 'conflict'],
      ['/state', 409, 'conflict'],
      ['/rate', 429, 'rate_limited'],
      ['/integrity', 500, 'internal'],
    ] as const;

    for (const [path, status, code] of cases) {
      const response = await request(app).get(path);
      expect(response.status).toBe(status);
      const body = errorEnvelopeSchema.parse(response.body);
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe(PUBLIC_ERROR_MESSAGES[code]);
      expect(JSON.stringify(response.body)).not.toContain('audit_hash_mismatch');
      expect(JSON.stringify(response.body)).not.toContain('title');
    }

    const rateLimited = await request(app).get('/rate');
    expect(rateLimited.headers['retry-after']).toBe('15');
  });
});
