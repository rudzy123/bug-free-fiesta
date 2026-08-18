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

const databaseUrlSchema = requiredString(
  'DATABASE_URL',
  'postgresql://USER:PASSWORD@localhost:5432/esign',
).refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
  message: 'DATABASE_URL must start with postgresql:// or postgres://',
});

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema.default('info'),
  API_HOST: requiredString('API_HOST', '0.0.0.0').default('0.0.0.0'),
  API_PORT: portSchema,
  CORS_ORIGINS: requiredString('CORS_ORIGINS', 'http://localhost:3000').transform((value, ctx) => {
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
  }),
  JSON_BODY_LIMIT: jsonBodyLimitSchema.default('1mb'),
  CORRELATION_ID_HEADER: requiredString('CORRELATION_ID_HEADER', 'x-correlation-id').default(
    'x-correlation-id',
  ),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DATABASE_URL: databaseUrlSchema,
});

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
