import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'validation',
  'authentication',
  'not_found',
  'forbidden',
  'conflict',
  'idempotency_replay',
  'payload_too_large',
  'rate_limited',
  'not_ready',
  'external_service',
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

export {
  ACCOUNT_CSRF_COOKIE_NAME_DEFAULT,
  ACCOUNT_CSRF_HEADER_NAME_DEFAULT,
  ACCOUNT_SESSION_COOKIE_NAME_DEFAULT,
  currentAccountUserResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  membershipRoleSchema,
  membershipSummarySchema,
  organizationActorResponseSchema,
  organizationIdParamSchema,
  revokeSessionRequestSchema,
  type CurrentAccountUserResponse,
  type LoginRequest,
  type LoginResponse,
  type OrganizationActorResponse,
  type RevokeSessionRequest,
} from './auth.js';
export {
  IDEMPOTENCY_KEY_HEADER,
  PREVIEW_TOKEN_HEADER_DEFAULT,
  UPLOAD_TOKEN_HEADER_DEFAULT,
  createDocumentRequestSchema,
  createDocumentResponseSchema,
  documentIdParamSchema,
  documentInspectionStatusSchema,
  issuePreviewResponseSchema,
  previewGrantIdParamSchema,
  publicDocumentRevisionSchema,
  publicDocumentSchema,
  publicSignatureFieldSchema,
  publicSignerSchema,
  replaceFieldsRequestSchema,
  replaceSignersRequestSchema,
  rotateSessionResponseSchema,
  revokeSessionResponseSchema,
  sendDocumentRequestSchema,
  sendDocumentResponseSchema,
  sessionIdParamSchema,
  signatureFieldTypeSchema,
  signerConsentResponseSchema,
  signerDocumentResponseSchema,
  signerFieldsResponseSchema,
  signerIdParamSchema,
  signerPreviewResponseSchema,
  signerSessionResponseSchema,
  signingModeSchema,
  SIGNING_CSRF_COOKIE_NAME_DEFAULT,
  SIGNING_SESSION_COOKIE_NAME_DEFAULT,
  declineToSignRequestSchema,
  declineToSignResponseSchema,
  exchangeSigningTokenRequestSchema,
  exchangeSigningTokenResponseSchema,
  recordSignerConsentRequestSchema,
  recordSignerConsentResponseSchema,
  recordSignerViewedResponseSchema,
  signatureInkPayloadSchema,
  signatureStrokePointSchema,
  completeSigningRequestSchema,
  completeSigningResponseSchema,
  type CompleteSigningRequest,
  type CompleteSigningResponse,
  type SignerConsentResponse,
  type SignerDocumentResponse,
  type SignerField,
  type SignerFieldsResponse,
  type SignerSessionResponse,
  type CreateDocumentRequest,
  type CreateDocumentResponse,
  type IssuePreviewResponse,
  type ReplaceFieldsRequest,
  type ReplaceSignersRequest,
  type SendDocumentRequest,
  type SendDocumentResponse,
} from './documents.js';
export {
  inspectDocumentJobPayloadSchema,
  notifySignerJobPayloadSchema,
  opaqueJobIdSchema,
  workerQueueHealthSchema,
  type InspectDocumentJobPayload,
  type NotifySignerJobPayload,
  type WorkerQueueHealth,
} from './jobs.js';
