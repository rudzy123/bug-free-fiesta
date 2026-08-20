import type { ErrorCode } from '@esign/contracts';

export const PUBLIC_ERROR_MESSAGES = {
  validation: 'The request was invalid.',
  authentication: 'Authentication is required.',
  forbidden: 'You are not allowed to perform this action.',
  not_found: 'The requested resource was not found.',
  conflict: 'The request conflicts with the current resource state.',
  idempotency_replay: 'This request was already processed.',
  payload_too_large: 'The request body is too large.',
  unsupported_media_type: 'The request content type is not supported.',
  rate_limited: 'Too many requests. Try again later.',
  not_ready: 'The service is temporarily unavailable.',
  service_unavailable: 'The service is temporarily unavailable. Try again later.',
  external_service: 'A downstream service is temporarily unavailable.',
  internal: 'An unexpected error occurred.',
} as const satisfies Record<ErrorCode, string>;
