import { describe, expect, it } from 'vitest';
import {
  EnvironmentValidationError,
  loadApiConfig,
  loadWebConfig,
  loadWorkerConfig,
} from './index.js';
import { apiEnv, webEnv, workerEnv } from '@esign/test-utils';

describe('environment validation', () => {
  it('loads a valid API configuration from explicit env', () => {
    const config = loadApiConfig(apiEnv());
    expect(config.API_PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(config.JSON_BODY_LIMIT).toBe('1mb');
    expect(config.CORRELATION_ID_HEADER).toBe('x-correlation-id');
    expect(config.DOCUMENT_MAX_UPLOAD_BYTES).toBe(26_214_400);
    expect(config.DOCUMENT_INSPECTOR).toBe('local');
    expect(config.SIGNING_SESSION_TTL_SECONDS).toBe(604_800);
    expect(config.DOCUMENT_FIELD_OVERLAP_POLICY).toBe('prohibit');
  });

  it('rejects the local document inspector in production', () => {
    expect(() =>
      loadApiConfig(
        apiEnv({
          NODE_ENV: 'production',
          AUTH_PROVIDER: 'oidc',
          AUTH_OIDC_ISSUER: 'https://idp.example.invalid/realms/esign',
          AUTH_OIDC_CLIENT_ID: 'client',
          AUTH_OIDC_CLIENT_SECRET: 'secret',
          AUTH_OIDC_REDIRECT_URI: 'https://api.example.invalid/auth/oidc/callback',
          DOCUMENT_INSPECTOR: 'local',
        }),
      ),
    ).toThrow(/DOCUMENT_INSPECTOR=local is not allowed in production/);
  });

  it('rejects the local identity adapter in production', () => {
    expect(() =>
      loadApiConfig(
        apiEnv({
          NODE_ENV: 'production',
          AUTH_PROVIDER: 'local',
        }),
      ),
    ).toThrow(/AUTH_PROVIDER=local is not allowed in production/);
  });

  it('requires OIDC settings when AUTH_PROVIDER=oidc without inventing values', () => {
    expect(() =>
      loadApiConfig(
        apiEnv({
          AUTH_PROVIDER: 'oidc',
          AUTH_LOCAL_SHARED_SECRET: undefined,
        }),
      ),
    ).toThrow(/AUTH_OIDC_ISSUER/);
  });

  it('fails fast with an actionable message when DATABASE_URL is missing', () => {
    expect(() => loadApiConfig(apiEnv({ DATABASE_URL: undefined }))).toThrow(
      EnvironmentValidationError,
    );
    try {
      loadApiConfig(apiEnv({ DATABASE_URL: undefined }));
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      const message = (error as EnvironmentValidationError).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('postgresql://');
    }
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => loadApiConfig(apiEnv({ DATABASE_URL: 'mysql://localhost/esign' }))).toThrow(
      /must start with postgresql:\/\//,
    );
  });

  it('rejects invalid CORS origins', () => {
    expect(() => loadApiConfig(apiEnv({ CORS_ORIGINS: 'not-a-url' }))).toThrow(/CORS origin/);
  });

  it('loads worker and web schemas from valid env', () => {
    const worker = loadWorkerConfig(workerEnv());
    const web = loadWebConfig(webEnv());
    expect(worker.WORKER_HEALTH_PORT).toBe(4100);
    expect(worker.WORKER_LEASE_MS).toBe(60_000);
    expect(worker.WORKER_STALE_QUEUE_MS).toBe(120_000);
    expect(worker.WORKER_PDF_TIMEOUT_MS).toBe(15_000);
    expect(worker.WORKER_ORPHAN_OBJECT_TTL_MS).toBe(86_400_000);
    expect(worker.WORKER_AUDIT_VERIFY_INTERVAL_MS).toBe(300_000);
    expect(worker.AUDIT_CHECKPOINT_STORE).toBe('disabled');
    expect(worker.OBJECT_STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(web.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:4000');
  });

  it('fails when the public API URL is not absolute', () => {
    expect(() => loadWebConfig(webEnv({ NEXT_PUBLIC_API_BASE_URL: '/api' }))).toThrow(
      EnvironmentValidationError,
    );
  });
});
