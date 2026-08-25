import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const objectStorageRoot = join(repoRoot, 'tmp', 'e2e-object-storage');

export const E2E_WEB_ORIGIN = 'http://localhost:3000';
export const E2E_API_ORIGIN = 'http://127.0.0.1:4000';
export const E2E_WORKER_ORIGIN = 'http://127.0.0.1:4100';

export const E2E_ADMIN_EMAIL = 'ada@example.test';
export const E2E_OTHER_ADMIN_EMAIL = 'beau@example.test';
export const E2E_LOCAL_SECRET = 'local-dev-only-shared-secret';

const shared = {
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://esign:esign_dev_password@localhost:5432/esign',
  CORS_ORIGINS: E2E_WEB_ORIGIN,
  JSON_BODY_LIMIT: '1mb',
  AUTH_JSON_BODY_LIMIT: '16kb',
  SIGNING_JSON_BODY_LIMIT: '512kb',
  CORRELATION_ID_HEADER: 'x-correlation-id',
  TRUST_PROXY: '0',
  API_REQUEST_TIMEOUT_MS: '30000',
  API_MAX_CONCURRENT_REQUESTS: '512',
  API_RATE_LIMIT_WINDOW_MS: '60000',
  API_RATE_LIMIT_MAX: '10000',
  SHUTDOWN_TIMEOUT_MS: '1000',
  AUTH_PROVIDER: 'local',
  AUTH_LOCAL_SHARED_SECRET: E2E_LOCAL_SECRET,
  AUTH_COOKIE_SECURE: 'false',
  AUTH_SESSION_TTL_SECONDS: '28800',
  AUTH_SESSION_COOKIE_NAME: 'esign_sid',
  AUTH_CSRF_COOKIE_NAME: 'esign_csrf',
  AUTH_CSRF_HEADER_NAME: 'x-csrf-token',
  AUTH_LOGIN_RATE_LIMIT_MAX: '1000',
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  DOCUMENT_MAX_UPLOAD_BYTES: '26214400',
  DOCUMENT_UPLOAD_TTL_SECONDS: '900',
  DOCUMENT_PREVIEW_TTL_SECONDS: '120',
  DOCUMENT_INSPECTOR: 'local',
  DOCUMENT_UPLOAD_TOKEN_HEADER: 'x-upload-token',
  DOCUMENT_PREVIEW_TOKEN_HEADER: 'x-preview-token',
  IDEMPOTENCY_TTL_SECONDS: '86400',
  SIGNING_SESSION_TTL_SECONDS: '604800',
  SIGNING_SESSION_COOKIE_NAME: 'esign_sign',
  SIGNING_CSRF_COOKIE_NAME: 'esign_sign_csrf',
  SIGNING_RATE_LIMIT_MAX: '1000',
  SIGNING_RATE_LIMIT_WINDOW_MS: '60000',
  SIGNING_CONSENT_COPY_ID: 'esign-disclosure-v1',
  SIGNING_CONSENT_VERSION: '1',
  SIGNING_CONSENT_TITLE: 'Electronic signature consent',
  SIGNING_CONSENT_TEXT:
    'By selecting Agree, you confirm that you have reviewed this document and intend to sign electronically. This text is a product placeholder and is not legal advice.',
  DOCUMENT_FIELD_OVERLAP_POLICY: 'prohibit',
  NOTIFICATION_ADAPTER: 'local',
  NOTIFICATION_PREVIEW_DIR: join(repoRoot, 'tmp', 'e2e-signing-notifications'),
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'esign-documents',
  OBJECT_STORAGE_ACCESS_KEY: 'esignminio',
  OBJECT_STORAGE_SECRET_KEY: 'esignminio_dev_password',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_DRIVER: 'filesystem',
  OBJECT_STORAGE_FS_ROOT: objectStorageRoot,
  AUDIT_CHECKPOINT_STORE: 'disabled',
} as const;

export function e2eApiEnv(): Record<string, string> {
  return {
    ...shared,
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
  };
}

export function e2eWorkerEnv(): Record<string, string> {
  return {
    ...shared,
    NODE_ENV: 'test',
    WORKER_HEALTH_HOST: '127.0.0.1',
    WORKER_HEALTH_PORT: '4100',
    WORKER_POLL_INTERVAL_MS: '250',
    WORKER_LEASE_MS: '60000',
    WORKER_BACKOFF_BASE_MS: '200',
    WORKER_BACKOFF_MAX_MS: '2000',
    WORKER_STALE_QUEUE_MS: '120000',
    WORKER_PDF_TIMEOUT_MS: '15000',
    WORKER_ORPHAN_OBJECT_TTL_MS: '86400000',
    WORKER_AUDIT_VERIFY_INTERVAL_MS: '300000',
  };
}

export function e2eWebEnv(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    NEXT_PUBLIC_API_BASE_URL: E2E_API_ORIGIN,
  };
}
