import { z, type ZodError, type ZodIssue } from 'zod';

export class EnvironmentValidationError extends Error {
  public constructor(public readonly details: readonly string[]) {
    super(`Invalid environment configuration:\n${details.map((line) => `  - ${line}`).join('\n')}`);
    this.name = 'EnvironmentValidationError';
  }
}

export function formatZodEnvError(error: ZodError): string[] {
  return error.issues.map((issue) => formatIssue(issue));
}

function formatIssue(issue: ZodIssue): string {
  const field = issue.path.length > 0 ? issue.path.map(String).join('.') : 'environment';
  return `${field}: ${issue.message}`;
}

const nodeEnvSchema = z.enum(['development', 'test', 'production'], {
  errorMap: () => ({
    message: 'NODE_ENV must be one of development, test, or production',
  }),
});

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
  errorMap: () => ({
    message: 'LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, or silent',
  }),
});

const portSchema = z.coerce.number().int().min(1).max(65535);

function requiredString(name: string, example: string): z.ZodString {
  return z
    .string({ required_error: `${name} is required. Example: ${example}` })
    .trim()
    .min(1, `${name} must not be empty. Example: ${example}`);
}

function parseOriginList(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const originSchema = z
  .string()
  .url('Each CORS origin must be an absolute URL such as http://localhost:3000');

const jsonBodyLimitSchema = z
  .string()
  .regex(/^\d+(?:b|kb|mb|gb)$/i, 'JSON_BODY_LIMIT must look like 256kb or 1mb');

/**
 * Number of trusted reverse-proxy hops in front of the API. This is a precise
 * topology count, never a boolean. Refusing `true` prevents blindly trusting
 * every X-Forwarded-For hop, which would let clients spoof their source IP.
 */
const trustProxySchema = z
  .string()
  .default('0')
  .superRefine((value, ctx) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'TRUST_PROXY must be a non-negative integer count of trusted reverse-proxy hops (e.g. 0 with no proxy, 1 behind one proxy). Do not set it to true; that would trust forged X-Forwarded-For headers.',
      });
      return;
    }
    if (!/^\d+$/.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TRUST_PROXY must be a non-negative integer number of trusted reverse-proxy hops.',
      });
    }
  })
  .transform((value) => Number.parseInt(value.trim(), 10))
  .refine((hops) => hops <= 16, {
    message: 'TRUST_PROXY must be 16 or fewer hops.',
  });

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const databaseUrlSchema = requiredString(
  'DATABASE_URL',
  'postgresql://USER:PASSWORD@localhost:5432/esign',
).refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
  message: 'DATABASE_URL must start with postgresql:// or postgres://',
});

const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema.default('info'),
    API_HOST: requiredString('API_HOST', '0.0.0.0').default('0.0.0.0'),
    API_PORT: portSchema,
    CORS_ORIGINS: requiredString('CORS_ORIGINS', 'http://localhost:3000').transform(
      (value, ctx) => {
        const origins = parseOriginList(value);
        if (origins.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'CORS_ORIGINS must include at least one origin, such as http://localhost:3000',
          });
          return z.NEVER;
        }
        for (const origin of origins) {
          const parsed = originSchema.safeParse(origin);
          if (!parsed.success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `CORS origin "${origin}" is invalid. Use an absolute URL such as http://localhost:3000`,
            });
            return z.NEVER;
          }
        }
        return origins;
      },
    ),
    JSON_BODY_LIMIT: jsonBodyLimitSchema.default('1mb'),
    AUTH_JSON_BODY_LIMIT: jsonBodyLimitSchema.default('16kb'),
    SIGNING_JSON_BODY_LIMIT: jsonBodyLimitSchema.default('512kb'),
    CORRELATION_ID_HEADER: requiredString('CORRELATION_ID_HEADER', 'x-correlation-id').default(
      'x-correlation-id',
    ),
    TRUST_PROXY: trustProxySchema,
    API_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    API_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(100_000).default(512),
    API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
    METRICS_BEARER_TOKEN: z.string().min(16).optional(),
    TOKEN_HASH_PEPPER: z.string().min(32).default('local-dev-only-token-hash-pepper-32chars'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    DATABASE_URL: databaseUrlSchema,
    AUTH_PROVIDER: z.enum(['local', 'oidc'], {
      errorMap: () => ({ message: 'AUTH_PROVIDER must be local or oidc' }),
    }),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(28_800),
    AUTH_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    AUTH_SESSION_COOKIE_NAME: requiredString('AUTH_SESSION_COOKIE_NAME', 'esign_sid').default(
      'esign_sid',
    ),
    AUTH_CSRF_COOKIE_NAME: requiredString('AUTH_CSRF_COOKIE_NAME', 'esign_csrf').default(
      'esign_csrf',
    ),
    AUTH_CSRF_HEADER_NAME: requiredString('AUTH_CSRF_HEADER_NAME', 'x-csrf-token').default(
      'x-csrf-token',
    ),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    AUTH_LOCAL_SHARED_SECRET: z.string().optional(),
    AUTH_OIDC_ISSUER: z.string().optional(),
    AUTH_OIDC_CLIENT_ID: z.string().optional(),
    AUTH_OIDC_CLIENT_SECRET: z.string().optional(),
    AUTH_OIDC_REDIRECT_URI: z.string().optional(),
    DOCUMENT_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(104_857_600)
      .default(26_214_400),
    DOCUMENT_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    DOCUMENT_PREVIEW_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
    DOCUMENT_INSPECTOR: z.enum(['local', 'fail_closed', 'structural']).default('local'),
    DOCUMENT_UPLOAD_TOKEN_HEADER: requiredString(
      'DOCUMENT_UPLOAD_TOKEN_HEADER',
      'x-upload-token',
    ).default('x-upload-token'),
    DOCUMENT_PREVIEW_TOKEN_HEADER: requiredString(
      'DOCUMENT_PREVIEW_TOKEN_HEADER',
      'x-preview-token',
    ).default('x-preview-token'),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(86_400),
    OBJECT_STORAGE_DRIVER: z.enum(['memory', 'filesystem', 's3']).default('memory'),
    OBJECT_STORAGE_FS_ROOT: z.string().optional(),
    OBJECT_STORAGE_ENDPOINT: z.string().optional(),
    OBJECT_STORAGE_REGION: z.string().optional(),
    OBJECT_STORAGE_BUCKET: z.string().optional(),
    OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
    OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
    OBJECT_STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? true : value === 'true')),
    AUDIT_CHECKPOINT_STORE: z.enum(['disabled', 'object_storage']).default('disabled'),
    SIGNING_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
    SIGNING_SESSION_COOKIE_NAME: requiredString(
      'SIGNING_SESSION_COOKIE_NAME',
      'esign_sign',
    ).default('esign_sign'),
    SIGNING_CSRF_COOKIE_NAME: requiredString('SIGNING_CSRF_COOKIE_NAME', 'esign_sign_csrf').default(
      'esign_sign_csrf',
    ),
    SIGNING_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    SIGNING_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    SIGNING_CONSENT_COPY_ID: requiredString(
      'SIGNING_CONSENT_COPY_ID',
      'esign-disclosure-v1',
    ).default('esign-disclosure-v1'),
    SIGNING_CONSENT_VERSION: requiredString('SIGNING_CONSENT_VERSION', '1').default('1'),
    SIGNING_CONSENT_TITLE: requiredString(
      'SIGNING_CONSENT_TITLE',
      'Electronic signature consent',
    ).default('Electronic signature consent'),
    SIGNING_CONSENT_TEXT: requiredString(
      'SIGNING_CONSENT_TEXT',
      'By selecting Agree, you confirm that you have reviewed this document and intend to sign electronically.',
    ).default(
      'By selecting Agree, you confirm that you have reviewed this document and intend to sign electronically. This text is a product placeholder and is not legal advice.',
    ),
    DOCUMENT_FIELD_OVERLAP_POLICY: z.enum(['prohibit', 'allow']).default('prohibit'),
    NOTIFICATION_ADAPTER: z.enum(['local', 'fail_closed']).default('local'),
    NOTIFICATION_PREVIEW_DIR: requiredString(
      'NOTIFICATION_PREVIEW_DIR',
      'tmp/signing-notifications',
    ).default('tmp/signing-notifications'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && data.AUTH_PROVIDER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'AUTH_PROVIDER=local is not allowed in production. Configure OIDC using docs/security/authentication-setup.md',
      });
    }
    if (data.AUTH_PROVIDER === 'local') {
      const secret = data.AUTH_LOCAL_SHARED_SECRET;
      if (secret === undefined || secret.trim().length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'AUTH_LOCAL_SHARED_SECRET must be at least 16 characters when AUTH_PROVIDER=local',
        });
      }
    }
    if (data.AUTH_PROVIDER === 'oidc') {
      const requiredOidc: ReadonlyArray<readonly [keyof typeof data, string]> = [
        ['AUTH_OIDC_ISSUER', 'https://idp.example.invalid/realms/esign'],
        ['AUTH_OIDC_CLIENT_ID', 'your-oidc-client-id'],
        ['AUTH_OIDC_CLIENT_SECRET', 'your-oidc-client-secret'],
        ['AUTH_OIDC_REDIRECT_URI', 'https://api.example.invalid/auth/oidc/callback'],
      ];
      for (const [field, example] of requiredOidc) {
        const value = data[field];
        if (typeof value !== 'string' || value.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} is required when AUTH_PROVIDER=oidc. Example: ${example}. See docs/security/authentication-setup.md`,
          });
        }
      }
      if (data.AUTH_OIDC_ISSUER && !isAbsoluteHttpUrl(data.AUTH_OIDC_ISSUER)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AUTH_OIDC_ISSUER must be an absolute https URL from your identity provider',
        });
      }
      if (data.AUTH_OIDC_REDIRECT_URI && !isAbsoluteHttpUrl(data.AUTH_OIDC_REDIRECT_URI)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'AUTH_OIDC_REDIRECT_URI must be an absolute URL registered with the identity provider',
        });
      }
    }
    if (data.NODE_ENV === 'production' && data.DOCUMENT_INSPECTOR === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'DOCUMENT_INSPECTOR=local is not allowed in production. Use DOCUMENT_INSPECTOR=structural (or fail_closed as an ops kill-switch).',
      });
    }
    if (
      data.NODE_ENV === 'production' &&
      (data.METRICS_BEARER_TOKEN === undefined || data.METRICS_BEARER_TOKEN.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'METRICS_BEARER_TOKEN is required in production (min 16 chars). Scrapers must send Authorization: Bearer <token>.',
      });
    }
    if (
      data.NODE_ENV === 'production' &&
      data.TOKEN_HASH_PEPPER.startsWith('local-dev-only-token-hash-pepper')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'TOKEN_HASH_PEPPER must be set to a unique production secret (not the local-dev default). Rotating it invalidates existing hashed tokens/sessions.',
      });
    }
    if (
      data.NODE_ENV === 'production' &&
      (data.OBJECT_STORAGE_DRIVER === 'memory' || data.OBJECT_STORAGE_DRIVER === 'filesystem')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'OBJECT_STORAGE_DRIVER=memory|filesystem is not allowed in production. Use OBJECT_STORAGE_DRIVER=s3 with a private S3-compatible bucket (MinIO is local-only).',
      });
    }
    if (data.OBJECT_STORAGE_DRIVER === 'filesystem') {
      const root = data.OBJECT_STORAGE_FS_ROOT;
      if (root === undefined || root.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'OBJECT_STORAGE_FS_ROOT is required when OBJECT_STORAGE_DRIVER=filesystem. Example: tmp/object-storage',
        });
      }
    }
    if (data.OBJECT_STORAGE_DRIVER === 's3') {
      const requiredS3: ReadonlyArray<readonly [keyof typeof data, string]> = [
        ['OBJECT_STORAGE_ENDPOINT', 'https://s3.example.invalid'],
        ['OBJECT_STORAGE_REGION', 'us-east-1'],
        ['OBJECT_STORAGE_BUCKET', 'esign-documents'],
        ['OBJECT_STORAGE_ACCESS_KEY', 'access-key-from-secrets-manager'],
        ['OBJECT_STORAGE_SECRET_KEY', 'secret-key-from-secrets-manager'],
      ];
      for (const [field, example] of requiredS3) {
        const value = data[field];
        if (typeof value !== 'string' || value.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${String(field)} is required when OBJECT_STORAGE_DRIVER=s3. Example: ${example}`,
          });
        }
      }
      if (
        typeof data.OBJECT_STORAGE_ENDPOINT === 'string' &&
        data.OBJECT_STORAGE_ENDPOINT.trim() !== '' &&
        !isAbsoluteHttpUrl(data.OBJECT_STORAGE_ENDPOINT)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'OBJECT_STORAGE_ENDPOINT must be an absolute URL such as http://localhost:9000',
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    AUTH_COOKIE_SECURE:
      data.AUTH_COOKIE_SECURE === 'true'
        ? true
        : data.AUTH_COOKIE_SECURE === 'false'
          ? false
          : data.NODE_ENV === 'production',
    AUTH_CSRF_HEADER_NAME: data.AUTH_CSRF_HEADER_NAME.toLowerCase(),
    DOCUMENT_UPLOAD_TOKEN_HEADER: data.DOCUMENT_UPLOAD_TOKEN_HEADER.toLowerCase(),
    DOCUMENT_PREVIEW_TOKEN_HEADER: data.DOCUMENT_PREVIEW_TOKEN_HEADER.toLowerCase(),
    OBJECT_STORAGE_FORCE_PATH_STYLE: data.OBJECT_STORAGE_FORCE_PATH_STYLE ?? true,
    SIGNING_SESSION_TTL_SECONDS: data.SIGNING_SESSION_TTL_SECONDS,
    SIGNING_SESSION_COOKIE_NAME: data.SIGNING_SESSION_COOKIE_NAME,
    SIGNING_CSRF_COOKIE_NAME: data.SIGNING_CSRF_COOKIE_NAME,
    SIGNING_RATE_LIMIT_WINDOW_MS: data.SIGNING_RATE_LIMIT_WINDOW_MS,
    SIGNING_RATE_LIMIT_MAX: data.SIGNING_RATE_LIMIT_MAX,
    SIGNING_CONSENT_COPY_ID: data.SIGNING_CONSENT_COPY_ID,
    SIGNING_CONSENT_VERSION: data.SIGNING_CONSENT_VERSION,
    SIGNING_CONSENT_TITLE: data.SIGNING_CONSENT_TITLE,
    SIGNING_CONSENT_TEXT: data.SIGNING_CONSENT_TEXT,
    DOCUMENT_FIELD_OVERLAP_POLICY: data.DOCUMENT_FIELD_OVERLAP_POLICY,
    NOTIFICATION_ADAPTER: data.NOTIFICATION_ADAPTER,
    NOTIFICATION_PREVIEW_DIR: data.NOTIFICATION_PREVIEW_DIR,
  }));

const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema.default('info'),
    DATABASE_URL: databaseUrlSchema,
    WORKER_HEALTH_HOST: requiredString('WORKER_HEALTH_HOST', '0.0.0.0').default('0.0.0.0'),
    WORKER_HEALTH_PORT: portSchema,
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(5_000),
    WORKER_LEASE_MS: z.coerce.number().int().min(1_000).default(60_000),
    WORKER_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(1_000),
    WORKER_BACKOFF_MAX_MS: z.coerce.number().int().min(1_000).default(300_000),
    WORKER_STALE_QUEUE_MS: z.coerce.number().int().min(1_000).default(120_000),
    WORKER_PDF_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    WORKER_ORPHAN_OBJECT_TTL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(604_800_000)
      .default(86_400_000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    METRICS_BEARER_TOKEN: z.string().min(16).optional(),
    OBJECT_STORAGE_ENDPOINT: requiredString('OBJECT_STORAGE_ENDPOINT', 'http://localhost:9000').url(
      'OBJECT_STORAGE_ENDPOINT must be an absolute URL such as http://localhost:9000',
    ),
    OBJECT_STORAGE_REGION: requiredString('OBJECT_STORAGE_REGION', 'us-east-1'),
    OBJECT_STORAGE_BUCKET: requiredString('OBJECT_STORAGE_BUCKET', 'esign-documents'),
    OBJECT_STORAGE_ACCESS_KEY: requiredString('OBJECT_STORAGE_ACCESS_KEY', 'minio-access-key'),
    OBJECT_STORAGE_SECRET_KEY: requiredString('OBJECT_STORAGE_SECRET_KEY', 'minio-secret-key'),
    OBJECT_STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    OBJECT_STORAGE_DRIVER: z.enum(['memory', 'filesystem', 's3']).default('memory'),
    OBJECT_STORAGE_FS_ROOT: z.string().optional(),
    AUDIT_CHECKPOINT_STORE: z.enum(['disabled', 'object_storage']).default('disabled'),
    WORKER_AUDIT_VERIFY_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(86_400_000)
      .default(300_000),
    DOCUMENT_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(104_857_600)
      .default(26_214_400),
    DOCUMENT_INSPECTOR: z.enum(['local', 'fail_closed', 'structural']).default('local'),
    NOTIFICATION_ADAPTER: z.enum(['local', 'fail_closed']).default('local'),
    NOTIFICATION_PREVIEW_DIR: requiredString(
      'NOTIFICATION_PREVIEW_DIR',
      'tmp/signing-notifications',
    ).default('tmp/signing-notifications'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && data.DOCUMENT_INSPECTOR === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'DOCUMENT_INSPECTOR=local is not allowed in production. Use DOCUMENT_INSPECTOR=structural (or fail_closed as an ops kill-switch).',
      });
    }
    if (
      data.NODE_ENV === 'production' &&
      (data.METRICS_BEARER_TOKEN === undefined || data.METRICS_BEARER_TOKEN.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'METRICS_BEARER_TOKEN is required in production (min 16 chars). Scrapers must send Authorization: Bearer <token>.',
      });
    }
    if (
      data.NODE_ENV === 'production' &&
      (data.OBJECT_STORAGE_DRIVER === 'memory' || data.OBJECT_STORAGE_DRIVER === 'filesystem')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'OBJECT_STORAGE_DRIVER=memory|filesystem is not allowed in production. Use OBJECT_STORAGE_DRIVER=s3 with a private S3-compatible bucket (MinIO is local-only).',
      });
    }
    if (data.OBJECT_STORAGE_DRIVER === 'filesystem') {
      const root = data.OBJECT_STORAGE_FS_ROOT;
      if (root === undefined || root.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'OBJECT_STORAGE_FS_ROOT is required when OBJECT_STORAGE_DRIVER=filesystem. Example: tmp/object-storage',
        });
      }
    }
  });

const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  NEXT_PUBLIC_API_BASE_URL: requiredString('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000').url(
    'NEXT_PUBLIC_API_BASE_URL must be an absolute URL such as http://localhost:4000',
  ),
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;
export type WorkerConfig = z.infer<typeof workerEnvSchema>;
export type WebConfig = z.infer<typeof webEnvSchema>;

function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  env: NodeJS.ProcessEnv,
  label: string,
): z.output<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const details = [
      `${label} failed validation. Check .env against .env.example.`,
      ...formatZodEnvError(result.error),
    ];
    throw new EnvironmentValidationError(details);
  }
  return result.data;
}

/**
 * Reads process.env only when callers omit `env`. Application code must call these
 * helpers instead of accessing process.env directly.
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return parseOrThrow(apiEnvSchema, env, 'API');
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseOrThrow(workerEnvSchema, env, 'Worker');
}

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  return parseOrThrow(webEnvSchema, env, 'Web');
}
