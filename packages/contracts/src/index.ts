import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'validation',
  'not_found',
  'forbidden',
  'conflict',
  'idempotency_replay',
  'payload_too_large',
  'not_ready',
  'internal',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string().min(1),
        correlationId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  correlationId: string,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      correlationId,
    },
  };
}

export const livenessResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string().min(1),
    correlationId: z.string().min(1),
  })
  .strict();

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessCheckSchema = z.enum(['up', 'down']);

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    service: z.string().min(1),
    checks: z
      .object({
        database: readinessCheckSchema,
      })
      .strict(),
    correlationId: z.string().min(1),
  })
  .strict();

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const CORRELATION_ID_HEADER_DEFAULT = 'x-correlation-id';
