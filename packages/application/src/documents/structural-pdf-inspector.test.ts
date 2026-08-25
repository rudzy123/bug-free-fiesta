import { describe, expect, it } from 'vitest';
import { PDF_CONTENT_TYPE } from './pdf.js';
import { createDocumentInspector, createStructuralDocumentInspector } from './inspectors.js';
import { findPdfMagicOffset, inspectPdfStructure } from './structural-pdf-inspector.js';

function pdf(extra = ''): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${extra}\n%%EOF\n`);
}

describe('structural PDF inspector (SEC-002)', () => {
  it('accepts a minimal PDF without active features', async () => {
    const inspector = createStructuralDocumentInspector();
    const result = await inspector.inspect({
      organizationId: 'org',
      documentId: 'doc',
      revisionId: 'rev',
      contentType: PDF_CONTENT_TYPE,
      body: pdf('1 0 obj<< /Type /Catalog >>endobj'),
    });
    expect(result).toEqual({ status: 'accepted', reasonCode: null });
  });

  it('rejects JavaScript-bearing PDFs', () => {
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'),
      }),
    ).toEqual({ status: 'rejected', reasonCode: 'pdf_javascript' });
  });

  it('rejects Launch actions and embedded files', () => {
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: pdf('/Launch << /Type /Action /F (cmd.exe) >>'),
      }).reasonCode,
    ).toBe('pdf_launch');
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: pdf('/EmbeddedFiles << /Names [] >>'),
      }).reasonCode,
    ).toBe('pdf_embedded_file');
  });

  it('rejects encrypted PDFs and HTML polyglot prefixes', () => {
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: pdf('/Encrypt << /Filter /Standard >>'),
      }).reasonCode,
    ).toBe('pdf_encrypt');
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: new TextEncoder().encode('<html>%PDF-1.4\n%%EOF\n'),
      }).reasonCode,
    ).toBe('not_pdf');
  });

  it('rejects missing %%EOF and allows limited leading whitespace', () => {
    expect(
      inspectPdfStructure({
        contentType: PDF_CONTENT_TYPE,
        body: new TextEncoder().encode('%PDF-1.4\n'),
      }).reasonCode,
    ).toBe('pdf_missing_eof');
    expect(findPdfMagicOffset(new TextEncoder().encode('\n\r %PDF-1.4\n%%EOF\n'))).toBe(3);
  });

  it('createDocumentInspector selects structural in production', async () => {
    const inspector = createDocumentInspector({ name: 'structural', nodeEnv: 'production' });
    const accepted = await inspector.inspect({
      organizationId: 'org',
      documentId: 'doc',
      revisionId: 'rev',
      contentType: PDF_CONTENT_TYPE,
      body: pdf(),
    });
    expect(accepted.status).toBe('accepted');
  });
});
