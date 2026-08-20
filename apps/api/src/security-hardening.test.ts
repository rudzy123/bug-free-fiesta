import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import { errorEnvelopeSchema } from '@esign/contracts';
import { createHealthService } from './application/health-service.js';
import { createApiApp } from './create-app.js';
import type { CreateApiAppOptions } from './create-app.js';
import type { DatabasePinger } from '@esign/database';

function okPinger(): DatabasePinger {
  return { ping: async () => undefined };
}

function buildApp(
  overrides: Record<string, string | undefined> = {},
  extraRoutes?: CreateApiAppOptions['extraRoutes'],
) {
  const config = loadApiConfig(apiEnv(overrides));
  const logger = createLogger({ name: 'security-test', level: 'silent' });
  const health = createHealthService(okPinger());
  return { config, app: createApiApp({ config, logger, health, extraRoutes }) };
}

describe('security headers', () => {
  it('sets a locked-down CSP, denies framing, and hides the stack', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('omits HSTS outside production', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/health/live');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends HSTS in production', async () => {
    const { app } = buildApp({
      NODE_ENV: 'production',
      AUTH_PROVIDER: 'oidc',
      AUTH_LOCAL_SHARED_SECRET: undefined,
      AUTH_OIDC_ISSUER: 'https://idp.example.invalid/realms/esign',
      AUTH_OIDC_CLIENT_ID: 'client',
      AUTH_OIDC_CLIENT_SECRET: 'secret',
      AUTH_OIDC_REDIRECT_URI: 'https://api.example.invalid/auth/oidc/callback',
      DOCUMENT_INSPECTOR: 'fail_closed',
      NOTIFICATION_ADAPTER: 'fail_closed',
    });
    const response = await request(app).get('/health/live');
    expect(response.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
  });
});

describe('strict content-type checking', () => {
  it('rejects an unsupported media type with 415', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/anything')
      .set('Content-Type', 'text/plain; charset=utf-8')
      .send('hello');
    expect(response.status).toBe(415);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('unsupported_media_type');
  });

  it('allows a supported media type through to routing', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/unknown-route')
      .set('Content-Type', 'application/json')
      .send({ a: 1 });
    expect(response.status).toBe(404);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('not_found');
  });

  it('does not block bodyless requests', async () => {
    const { app } = buildApp();
    const response = await request(app).post('/unknown-route');
    expect(response.status).toBe(404);
  });
});

describe('HTTP parameter pollution', () => {
  it('rejects duplicated query parameters', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/health/live?token=a&token=b');
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('validation');
  });
});

describe('route-specific body-size limits', () => {
  it('returns 413 when a JSON body exceeds the parser limit', async () => {
    const { app } = buildApp({}, (expressApp) => {
      expressApp.use('/sized', express.json({ limit: '1kb' }));
      expressApp.post('/sized', (_req, res) => {
        res.status(200).json({ ok: true });
      });
    });
    const large = { data: 'x'.repeat(4096) };
    const response = await request(app)
      .post('/sized')
      .set('Content-Type', 'application/json')
      .send(large);
    expect(response.status).toBe(413);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('payload_too_large');
  });

  it('accepts a small JSON body under the limit', async () => {
    const { app } = buildApp({}, (expressApp) => {
      expressApp.use('/sized', express.json({ limit: '1kb' }));
      expressApp.post('/sized', (_req, res) => {
        res.status(200).json({ ok: true });
      });
    });
    const response = await request(app)
      .post('/sized')
      .set('Content-Type', 'application/json')
      .send({ data: 'small' });
    expect(response.status).toBe(200);
  });
});

describe('rate limiting by client IP', () => {
  it('returns 429 with Retry-After once the general limit is exceeded', async () => {
    const { app } = buildApp({ API_RATE_LIMIT_MAX: '2', API_RATE_LIMIT_WINDOW_MS: '60000' });
    await request(app).get('/unknown-a');
    await request(app).get('/unknown-b');
    const limited = await request(app).get('/unknown-c');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(errorEnvelopeSchema.parse(limited.body).error.code).toBe('rate_limited');
  });

  it('does not rate-limit liveness/readiness probes', async () => {
    const { app } = buildApp({ API_RATE_LIMIT_MAX: '1' });
    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).get('/health/live');
      expect(response.status).toBe(200);
    }
  });
});

describe('graceful overload behavior', () => {
  it('sheds load with 503 + Retry-After beyond the concurrency limit', async () => {
    const { app } = buildApp({ API_MAX_CONCURRENT_REQUESTS: '1' }, (expressApp) => {
      expressApp.get('/slow', (_req, res) => {
        setTimeout(() => {
          res.status(200).json({ ok: true });
        }, 150);
      });
    });
    const responses = await Promise.all([
      request(app).get('/slow'),
      request(app).get('/slow'),
      request(app).get('/slow'),
    ]);
    const statuses = responses.map((response) => response.status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(503);
    const shed = responses.find((response) => response.status === 503);
    expect(shed?.headers['retry-after']).toBeDefined();
    expect(errorEnvelopeSchema.parse(shed?.body).error.code).toBe('service_unavailable');
  });
});

describe('trusted-proxy driven client IP', () => {
  it('ignores X-Forwarded-For when TRUST_PROXY is 0 (default)', async () => {
    const { app } = buildApp({ TRUST_PROXY: '0' }, (expressApp) => {
      expressApp.get('/whoami', (req, res) => {
        res.status(200).json({ clientIp: req.clientIp });
      });
    });
    const response = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', '203.0.113.9, 1.2.3.4');
    expect(response.status).toBe(200);
    // Loopback socket peer wins; the forged header is ignored.
    expect(response.body.clientIp).toBe('127.0.0.1');
  });

  it('uses the proxy-appended address under a one-hop topology and ignores spoofed entries', async () => {
    const { app } = buildApp({ TRUST_PROXY: '1' }, (expressApp) => {
      expressApp.get('/whoami', (req, res) => {
        res.status(200).json({ clientIp: req.clientIp });
      });
    });
    // The loopback socket peer acts as the single trusted proxy; the last
    // X-Forwarded-For entry is the one it "appended". Leftmost values are forged.
    const response = await request(app)
      .get('/whoami')
      .set('X-Forwarded-For', 'attacker-spoof, 203.0.113.9');
    expect(response.body.clientIp).toBe('203.0.113.9');
  });

  it('rejects TRUST_PROXY=true at configuration time', () => {
    expect(() => buildApp({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });
});

describe('safe error envelopes', () => {
  it('never leaks internals or stack traces from a thrown error', async () => {
    const { app } = buildApp({}, (expressApp) => {
      expressApp.get('/boom', () => {
        throw new Error('secret internal detail token=abc');
      });
    });
    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    const body = errorEnvelopeSchema.parse(response.body);
    expect(body.error.code).toBe('internal');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(response.body)).not.toContain('secret internal detail');
    expect(JSON.stringify(response.body)).not.toMatch(/stack/i);
    expect(body.error.correlationId).toBeDefined();
  });
});
