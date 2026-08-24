import { isApplicationError, isFinalizationFailureCode } from '@esign/domain';

/** Bounded PDF failure categories for `esign_pdf_failures_total`. */
export const PDF_METRIC_CATEGORIES = [
  'INVALID_PDF',
  'ENCRYPTED_PDF_UNSUPPORTED',
  'PDF_GENERATION_FAILED',
  'INVALID_SIGNATURE_IMAGE',
  'not_pdf',
  'local_stub_reject_marker',
  'inspector_unconfigured',
] as const;

export type PdfMetricCategory = (typeof PDF_METRIC_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(PDF_METRIC_CATEGORIES);

export function isPdfMetricCategory(value: string): value is PdfMetricCategory {
  return CATEGORY_SET.has(value);
}

/**
 * Maps application errors (and inspection reason codes) to a bounded PDF
 * failure category, or null when the failure is not PDF-processing related.
 */
export function pdfFailureCategoryFromError(error: unknown): PdfMetricCategory | null {
  if (!isApplicationError(error)) {
    return null;
  }
  const code = error.details.code;
  if (typeof code === 'string' && isPdfMetricCategory(code)) {
    return code;
  }
  if (typeof code === 'string' && isFinalizationFailureCode(code) && isPdfMetricCategory(code)) {
    return code;
  }
  return null;
}

export function pdfFailureCategoryFromReasonCode(
  reasonCode: string | null,
): PdfMetricCategory | null {
  if (reasonCode === null) {
    return null;
  }
  return isPdfMetricCategory(reasonCode) ? reasonCode : null;
}
