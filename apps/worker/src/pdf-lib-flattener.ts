import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  finalizationError,
  isApplicationError,
  type FlattenedAppearance,
  type PdfFlattener,
} from '@esign/domain';

/**
 * Narrow pdf-lib adapter. PDFs stay in memory; this module never writes temp files.
 * Domain/application must not import pdf-lib.
 */
export function createPdfLibFlattener(): PdfFlattener {
  return {
    async flatten(input) {
      return withLimit(flattenPdf(input), input.timeoutMs);
    },
  };
}

async function flattenPdf(input: {
  pdfBytes: Uint8Array;
  appearances: readonly FlattenedAppearance[];
  occurredAt: Date;
}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  try {
    return await flattenPdfUnsafe(input);
  } catch (error: unknown) {
    if (isApplicationError(error)) {
      throw error;
    }
    throw mapPdfLoadError(error);
  }
}

async function flattenPdfUnsafe(input: {
  pdfBytes: Uint8Array;
  appearances: readonly FlattenedAppearance[];
  occurredAt: Date;
}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  let document;
  try {
    document = await PDFDocument.load(input.pdfBytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      capNumbers: true,
      updateMetadata: false,
    });
  } catch (error: unknown) {
    throw mapPdfLoadError(error);
  }
  if (document.isEncrypted) {
    throw finalizationError('ENCRYPTED_PDF_UNSUPPORTED');
  }

  const pages = document.getPages();
  if (pages.length === 0) {
    throw finalizationError('INVALID_PDF', { reason: 'empty' });
  }

  document.setCreationDate(input.occurredAt);
  document.setModificationDate(input.occurredAt);
  document.setProducer('esign-worker');
  document.setCreator('esign-worker');

  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const appearance of input.appearances) {
    const page = pages[appearance.field.pageNumber - 1];
    if (page === undefined) {
      throw finalizationError('INVALID_SIGNATURE_FIELD', {
        fieldId: appearance.field.id,
        reason: 'page',
      });
    }
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const box = {
      x: appearance.field.x * pageWidth,
      y: appearance.field.y * pageHeight,
      width: appearance.field.width * pageWidth,
      height: appearance.field.height * pageHeight,
    };
    if (appearance.pngBytes) {
      let image;
      try {
        image = await document.embedPng(appearance.pngBytes);
      } catch {
        throw finalizationError('INVALID_SIGNATURE_IMAGE', { fieldId: appearance.field.id });
      }
      page.drawImage(image, box);
    }
    const label = appearanceLabel(appearance);
    if (label !== null) {
      const fontSize = Math.max(6, Math.min(11, box.height * 0.45));
      page.drawText(label, {
        x: box.x + 2,
        y: box.y + Math.max(2, (box.height - fontSize) / 2),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: Math.max(8, box.width - 4),
      });
    }
  }

  let saved;
  try {
    saved = await document.save({
      useObjectStreams: false,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
  } catch (error: unknown) {
    throw finalizationError('PDF_GENERATION_FAILED', {
      cause: error instanceof Error ? error.name : 'unknown',
    });
  }
  return { pdfBytes: Uint8Array.from(saved), pageCount: pages.length };
}

function appearanceLabel(appearance: FlattenedAppearance): string | null {
  if (appearance.signerName !== null && appearance.signerName !== '') {
    return appearance.signerName;
  }
  if (appearance.signedAt !== null) {
    return `${appearance.signedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  }
  return null;
}

function mapPdfLoadError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (/encrypt/i.test(message)) {
    throw finalizationError('ENCRYPTED_PDF_UNSUPPORTED');
  }
  throw finalizationError('INVALID_PDF', {
    cause: error instanceof Error ? error.name : 'unknown',
  });
}

async function withLimit<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(finalizationError('PDF_GENERATION_FAILED', { reason: 'timeout' }));
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
