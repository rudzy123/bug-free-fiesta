import type { PdfFlattener } from '@esign/domain';

/** Deterministic stand-in used in application tests. Production uses pdf-lib in the worker. */
export function createMemoryPdfFlattener(): PdfFlattener {
  return {
    async flatten(input) {
      return { pdfBytes: Uint8Array.from(input.pdfBytes), pageCount: 1 };
    },
  };
}
