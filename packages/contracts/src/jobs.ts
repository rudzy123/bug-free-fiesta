import { z } from 'zod';

export const opaqueJobIdSchema = z.string().uuid();

export const inspectDocumentJobPayloadSchema = z
  .object({
    documentId: opaqueJobIdSchema,
    revisionId: opaqueJobIdSchema,
  })
  .strict();

export type InspectDocumentJobPayload = z.infer<typeof inspectDocumentJobPayloadSchema>;

export const notifySignerJobPayloadSchema = z
  .object({
    signerId: opaqueJobIdSchema,
    sessionId: opaqueJobIdSchema,
  })
  .strict();

export type NotifySignerJobPayload = z.infer<typeof notifySignerJobPayloadSchema>;

export const flattenSignatureJobPayloadSchema = z
  .object({
    documentId: opaqueJobIdSchema,
    signerId: opaqueJobIdSchema,
    sessionId: opaqueJobIdSchema,
    revisionId: opaqueJobIdSchema,
  })
  .strict();

export type FlattenSignatureJobPayload = z.infer<typeof flattenSignatureJobPayloadSchema>;

export const workerQueueHealthSchema = z
  .object({
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    expiredLeases: z.number().int().nonnegative(),
    oldestAvailableAt: z.string().datetime().nullable(),
    stale: z.boolean(),
  })
  .strict();

export type WorkerQueueHealth = z.infer<typeof workerQueueHealthSchema>;
