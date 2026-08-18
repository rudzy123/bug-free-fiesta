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
    CORRELATION_ID_HEADER: requiredString('CORRELATION_ID_HEADER', 'x-correlation-id').default(
      'x-correlation-id',
    ),
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
  }));

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema.default('info'),
  DATABASE_URL: databaseUrlSchema,
  WORKER_HEALTH_HOST: requiredString('WORKER_HEALTH_HOST', '0.0.0.0').default('0.0.0.0'),
  WORKER_HEALTH_PORT: portSchema,
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(5_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
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
