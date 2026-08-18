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
    expect(worker.OBJECT_STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(web.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:4000');
  });

  it('fails when the public API URL is not absolute', () => {
    expect(() => loadWebConfig(webEnv({ NEXT_PUBLIC_API_BASE_URL: '/api' }))).toThrow(
      EnvironmentValidationError,
    );
  });
});
