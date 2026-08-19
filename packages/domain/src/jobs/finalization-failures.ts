import {
  ConflictError,
  ExternalServiceError,
  IntegrityError,
  ValidationError,
  type ApplicationError,
} from '../errors.js';

export const FINALIZATION_FAILURE_CODES = [
  'SOURCE_OBJECT_NOT_FOUND',
  'SOURCE_INTEGRITY_FAILURE',
  'INVALID_PDF',
  'ENCRYPTED_PDF_UNSUPPORTED',
  'INVALID_SIGNATURE_IMAGE',
  'INVALID_SIGNATURE_FIELD',
  'PDF_GENERATION_FAILED',
  'FINAL_OBJECT_UPLOAD_FAILED',
  'FINAL_OBJECT_INTEGRITY_FAILURE',
  'CONCURRENT_FINALIZATION',
  'DATABASE_COMMIT_FAILED',
] as const;

export type FinalizationFailureCode = (typeof FINALIZATION_FAILURE_CODES)[number];

export function isFinalizationFailureCode(value: unknown): value is FinalizationFailureCode {
  return (
    typeof value === 'string' && (FINALIZATION_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export function finalizationError(
  code: FinalizationFailureCode,
  details: Readonly<Record<string, unknown>> = {},
): ApplicationError {
  const payload = { code, ...details };
  switch (code) {
    case 'SOURCE_OBJECT_NOT_FOUND':
    case 'PDF_GENERATION_FAILED':
    case 'FINAL_OBJECT_UPLOAD_FAILED':
    case 'DATABASE_COMMIT_FAILED':
      return new ExternalServiceError(payload);
    case 'SOURCE_INTEGRITY_FAILURE':
    case 'FINAL_OBJECT_INTEGRITY_FAILURE':
      return new IntegrityError(payload);
    case 'INVALID_PDF':
    case 'ENCRYPTED_PDF_UNSUPPORTED':
    case 'INVALID_SIGNATURE_IMAGE':
    case 'INVALID_SIGNATURE_FIELD':
      return new ValidationError(payload);
    case 'CONCURRENT_FINALIZATION':
      return new ConflictError(payload);
  }
}
