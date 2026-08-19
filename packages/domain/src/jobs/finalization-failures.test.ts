import { describe, expect, it } from 'vitest';
import { ConflictError, ExternalServiceError, IntegrityError, ValidationError } from '../errors.js';
import { classifyJobFailure } from './failures.js';
import { FINALIZATION_FAILURE_CODES, finalizationError } from './finalization-failures.js';

describe('finalizationError', () => {
  it('maps integrity and validation codes to non-retryable failures', () => {
    expect(finalizationError('SOURCE_INTEGRITY_FAILURE')).toBeInstanceOf(IntegrityError);
    expect(finalizationError('INVALID_PDF')).toBeInstanceOf(ValidationError);
    expect(finalizationError('ENCRYPTED_PDF_UNSUPPORTED')).toBeInstanceOf(ValidationError);
    expect(finalizationError('INVALID_SIGNATURE_IMAGE')).toBeInstanceOf(ValidationError);
    expect(finalizationError('INVALID_SIGNATURE_FIELD')).toBeInstanceOf(ValidationError);
    expect(classifyJobFailure(finalizationError('INVALID_PDF')).retryable).toBe(false);
  });

  it('maps upload, generation, and commit failures to retryable errors', () => {
    expect(finalizationError('SOURCE_OBJECT_NOT_FOUND')).toBeInstanceOf(ExternalServiceError);
    expect(finalizationError('CONCURRENT_FINALIZATION')).toBeInstanceOf(ConflictError);
    expect(finalizationError('FINAL_OBJECT_UPLOAD_FAILED')).toBeInstanceOf(ExternalServiceError);
    expect(finalizationError('DATABASE_COMMIT_FAILED')).toBeInstanceOf(ExternalServiceError);
    expect(classifyJobFailure(finalizationError('CONCURRENT_FINALIZATION')).retryable).toBe(true);
    expect(classifyJobFailure(finalizationError('DATABASE_COMMIT_FAILED')).retryable).toBe(true);
  });

  it('exposes the closed set of codes', () => {
    expect(FINALIZATION_FAILURE_CODES).toContain('PDF_GENERATION_FAILED');
  });
});
