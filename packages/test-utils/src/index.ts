import { createHash } from 'node:crypto';

export type Clock = {
  nowUtc: () => Date;
};

export function frozenClock(isoUtc: string): Clock {
  const instant = new Date(isoUtc);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`frozenClock requires a valid UTC instant, received: ${isoUtc}`);
  }
  return {
    nowUtc: () => new Date(instant.getTime()),
  };
}

export function systemClock(): Clock {
  return {
    nowUtc: () => new Date(),
  };
}

export function newOpaqueId(): string {
  return crypto.randomUUID();
}

/** SHA-256 hex of a synthetic label. Never a digest of a customer PDF. */
export function syntheticSha256(label: string): string {
  return createHash('sha256').update(`esign-synthetic:${label}`).digest('hex');
}

export function organizationAttrs(overrides: { id?: string; name?: string } = {}): {
  id: string;
  name: string;
} {
  return {
    id: overrides.id ?? newOpaqueId(),
    name: overrides.name ?? 'Example Organization',
  };
}

export function apiEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    CORS_ORIGINS: 'http://localhost:3000',
    JSON_BODY_LIMIT: '1mb',
    CORRELATION_ID_HEADER: 'x-correlation-id',
    SHUTDOWN_TIMEOUT_MS: '1000',
    DATABASE_URL: 'postgresql://esign:esign_dev_password@localhost:5432/esign',
    ...overrides,
  };
}

export function workerEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://esign:esign_dev_password@localhost:5432/esign',
    WORKER_HEALTH_HOST: '127.0.0.1',
    WORKER_HEALTH_PORT: '4100',
    WORKER_POLL_INTERVAL_MS: '250',
    SHUTDOWN_TIMEOUT_MS: '1000',
    OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: 'esign-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'esignminio',
    OBJECT_STORAGE_SECRET_KEY: 'esignminio_dev_password',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    ...overrides,
  };
}

export function webEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    ...overrides,
  };
}
