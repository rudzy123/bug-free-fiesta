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
export const signingModeSchema = z.enum(['ordered', 'parallel']);
export const signatureFieldTypeSchema = z.enum([
  'signature',
  'initials',
  'date_signed',
  'signer_name',
]);
export const signerStatusSchema = z.enum(['pending', 'signed', 'declined']);

export const publicDocumentRevisionSchema = z
  .object({
    revisionId: z.string().uuid(),
    contentType: z.literal('application/pdf'),
    sizeBytes: z.number().int().positive(),
    sha256Digest: z.string().regex(/^[0-9a-f]{64}$/),
    displayName: z.string().min(1),
    pageCount: z.number().int().positive(),
  })
  .strict();

export const publicSignerSchema = z
  .object({
    signerId: z.string().uuid(),
    email: z.string().email().nullable(),
    displayName: z.string().min(1),
    routingOrder: z.number().int().positive(),
    status: signerStatusSchema,
  })
  .strict();

export const publicSignatureFieldSchema = z
  .object({
    fieldId: z.string().uuid(),
    signerId: z.string().uuid(),
    type: signatureFieldTypeSchema,
    pageNumber: z.number().int().positive(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    required: z.boolean(),
  })
  .strict();

export const publicDocumentSchema = z
  .object({
    documentId: z.string().uuid(),
    title: z.string().min(1),
    state: z.string().min(1),
    signingMode: signingModeSchema,
    inspectionStatus: documentInspectionStatusSchema,
    displayName: z.string().nullable(),
    availableForSigning: z.boolean(),
    currentRevision: publicDocumentRevisionSchema.nullable(),
    signers: z.array(publicSignerSchema),
    fields: z.array(publicSignatureFieldSchema),
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
export const signerIdParamSchema = z.string().uuid();
export const sessionIdParamSchema = z.string().uuid();

export const replaceSignersRequestSchema = z
  .object({
    signingMode: signingModeSchema,
    signers: z
      .array(
        z
          .object({
            signerId: z.string().uuid().optional(),
            email: z.string().email().max(254),
            displayName: z.string().trim().min(1).max(120),
            routingOrder: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export type ReplaceSignersRequest = z.infer<typeof replaceSignersRequestSchema>;

export const replaceFieldsRequestSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            signerId: z.string().uuid(),
            type: signatureFieldTypeSchema,
            pageNumber: z.number().int().positive(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            required: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export type ReplaceFieldsRequest = z.infer<typeof replaceFieldsRequestSchema>;

export const sendDocumentRequestSchema = z
  .object({
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type SendDocumentRequest = z.infer<typeof sendDocumentRequestSchema>;

export const sendDocumentResponseSchema = publicDocumentSchema.extend({
  invitations: z.array(
    z
      .object({
        signerId: z.string().uuid(),
        sessionId: z.string().uuid(),
        expiresAt: z.string().datetime(),
        token: z.string().nullable(),
      })
      .strict(),
  ),
});

export type SendDocumentResponse = z.infer<typeof sendDocumentResponseSchema>;

export const rotateSessionResponseSchema = z
  .object({
    signerId: z.string().uuid(),
    sessionId: z.string().uuid(),
    expiresAt: z.string().datetime(),
    token: z.string().min(1),
  })
  .strict();

export const revokeSessionResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    status: z.literal('revoked'),
  })
  .strict();

export const signerSessionClaimSchema = z
  .object({
    documentId: z.string().uuid().optional(),
    signerId: z.string().uuid().optional(),
  })
  .strict();

export const signerSessionResponseSchema = z
  .object({
    documentId: z.string().uuid(),
    signerId: z.string().uuid(),
    sessionId: z.string().uuid(),
    sessionStatus: z.enum(['issued', 'active']),
    title: z.string().min(1),
    signingMode: signingModeSchema,
    expiresAt: z.string().datetime(),
    fields: z.array(
      z
        .object({
          fieldId: z.string().uuid(),
          type: signatureFieldTypeSchema,
          pageNumber: z.number().int().positive(),
          required: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
