import { isApplicationError } from '../errors.js';
import type { JobErrorCategory } from '../entities.js';

export type ClassifiedJobFailure = {
  readonly category: JobErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
};

export function classifyJobFailure(error: unknown): ClassifiedJobFailure {
  if (isApplicationError(error)) {
    if (
      error.kind === 'external_service' ||
      error.kind === 'rate_limit' ||
      error.kind === 'conflict'
    ) {
      return { category: 'retryable', code: error.kind, retryable: true };
    }
    return { category: 'non_retryable', code: error.kind, retryable: false };
  }
  return { category: 'retryable', code: 'unknown', retryable: true };
}

export function formatJobErrorCode(category: JobErrorCategory, code: string): string {
  return `${category}:${code}`;
}
