import { describe, expect, it } from 'vitest';
import { ConflictError, ExternalServiceError, IntegrityError, ValidationError } from '../errors.js';
import { classifyJobFailure, formatJobErrorCode } from './failures.js';

describe('classifyJobFailure', () => {
  it('treats external and conflict failures as retryable', () => {
    expect(classifyJobFailure(new ExternalServiceError({ reason: 'missing_object' }))).toEqual({
      category: 'retryable',
      code: 'external_service',
      retryable: true,
    });
    expect(classifyJobFailure(new ConflictError())).toMatchObject({ retryable: true });
  });

  it('treats validation and integrity failures as non-retryable poison', () => {
    expect(classifyJobFailure(new ValidationError({ reason: 'invalid_payload' }))).toEqual({
      category: 'non_retryable',
      code: 'validation',
      retryable: false,
    });
    expect(classifyJobFailure(new IntegrityError())).toMatchObject({
      category: 'non_retryable',
      retryable: false,
    });
  });

  it('retries unknown failures until the attempt budget is exhausted', () => {
    expect(classifyJobFailure(new Error('boom'))).toEqual({
      category: 'retryable',
      code: 'unknown',
      retryable: true,
    });
  });

  it('stores category in lastErrorCode form', () => {
    expect(formatJobErrorCode('retryable', 'external_service')).toBe('retryable:external_service');
  });
});
