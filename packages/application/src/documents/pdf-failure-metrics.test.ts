import { describe, expect, it } from 'vitest';
import { finalizationError, ValidationError } from '@esign/domain';
import {
  isPdfMetricCategory,
  pdfFailureCategoryFromError,
  pdfFailureCategoryFromReasonCode,
} from './pdf-failure-metrics.js';

describe('pdf failure metrics helpers', () => {
  it('classifies finalization PDF codes', () => {
    expect(pdfFailureCategoryFromError(finalizationError('PDF_GENERATION_FAILED'))).toBe(
      'PDF_GENERATION_FAILED',
    );
    expect(pdfFailureCategoryFromError(finalizationError('INVALID_PDF'))).toBe('INVALID_PDF');
    expect(pdfFailureCategoryFromError(finalizationError('SOURCE_OBJECT_NOT_FOUND'))).toBeNull();
  });

  it('ignores unrelated validation errors', () => {
    expect(
      pdfFailureCategoryFromError(new ValidationError({ reason: 'payload_too_large' })),
    ).toBeNull();
  });

  it('maps inspection reason codes', () => {
    expect(pdfFailureCategoryFromReasonCode('not_pdf')).toBe('not_pdf');
    expect(pdfFailureCategoryFromReasonCode('unknown_reason')).toBeNull();
    expect(isPdfMetricCategory('inspector_unconfigured')).toBe(true);
  });
});
