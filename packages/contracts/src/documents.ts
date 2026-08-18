import { z } from 'zod';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const UPLOAD_TOKEN_HEADER_DEFAULT = 'x-upload-token';
export const PREVIEW_TOKEN_HEADER_DEFAULT = 'x-preview-token';

export const createDocumentRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    filename: z.string().min(1).max(240),
  })
  .strict();

export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const documentInspectionStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const publicDocumentRevisionSchema = z
  .object({
    revisionId: z.string().uuid(),
    contentType: z.literal('application/pdf'),
    sizeBytes: z.number().int().positive(),
    sha256Digest: z.string().regex(/^[0-9a-f]{64}$/),
    displayName: z.string().min(1),
  })
  .strict();

export const publicDocumentSchema = z
  .object({
    documentId: z.string().uuid(),
    title: z.string().min(1),
    state: z.string().min(1),
    inspectionStatus: documentInspectionStatusSchema,
    displayName: z.string().nullable(),
    availableForSigning: z.boolean(),
    currentRevision: publicDocumentRevisionSchema.nullable(),
  })
  .strict();

export const createDocumentResponseSchema = publicDocumentSchema.extend({
  upload: z
    .object({
      url: z.string().min(1),
      method: z.literal('PUT'),
      expiresAt: z.string().datetime(),
      maxBytes: z.number().int().positive(),
      contentType: z.literal('application/pdf'),
      tokenHeader: z.string().min(1),
      token: z.string().nullable(),
    })
    .strict(),
});

export type CreateDocumentResponse = z.infer<typeof createDocumentResponseSchema>;

export const issuePreviewResponseSchema = z
  .object({
    url: z.string().min(1),
    expiresAt: z.string().datetime(),
    tokenHeader: z.string().min(1),
    token: z.string().min(1),
    contentType: z.literal('application/pdf'),
  })
  .strict();

export type IssuePreviewResponse = z.infer<typeof issuePreviewResponseSchema>;

export const documentIdParamSchema = z.string().uuid();
export const previewGrantIdParamSchema = z.string().uuid();
