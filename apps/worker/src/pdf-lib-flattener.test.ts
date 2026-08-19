import { describe, expect, it } from 'vitest';
import { ValidationError } from '@esign/domain';
import { createTestPdf, createTestPng } from '@esign/test-utils';
import { createSha256Hashing } from '@esign/application';
import { createPdfLibFlattener } from './pdf-lib-flattener.js';

const FIELD = {
  id: '77777777-7777-4777-8777-777777777777',
  organizationId: '11111111-1111-4111-8111-111111111111',
  documentId: '44444444-4444-4444-8444-444444444444',
  signerId: '55555555-5555-4555-8555-555555555555',
  type: 'signature' as const,
  pageNumber: 1,
  x: 0.1,
  y: 0.1,
  width: 0.25,
  height: 0.08,
  required: true,
  completedAt: new Date('2026-08-19T12:00:00.000Z'),
  completionObjectKey: null,
  completionContentType: null,
  completionSizeBytes: null,
  completionSha256Digest: null,
  flattenedRevisionId: null,
  createdAt: new Date('2026-08-19T12:00:00.000Z'),
  updatedAt: new Date('2026-08-19T12:00:00.000Z'),
};

describe('pdf-lib flattener', () => {
  it('stamps a PNG deterministically and changes the PDF digest', async () => {
    const hashing = createSha256Hashing();
    const pdfBytes = await createTestPdf();
    const pngBytes = createTestPng({ width: 24, height: 12 });
    const flattener = createPdfLibFlattener();
    const occurredAt = new Date('2026-08-19T12:00:00.000Z');
    const first = await flattener.flatten({
      pdfBytes,
      appearances: [{ field: FIELD, pngBytes, signerName: null, signedAt: null }],
      occurredAt,
      timeoutMs: 5_000,
    });
    const second = await flattener.flatten({
      pdfBytes,
      appearances: [{ field: FIELD, pngBytes, signerName: null, signedAt: null }],
      occurredAt,
      timeoutMs: 5_000,
    });
    expect(first.pageCount).toBe(1);
    expect(hashing.sha256Hex(first.pdfBytes)).not.toBe(hashing.sha256Hex(pdfBytes));
    expect(hashing.sha256Hex(first.pdfBytes)).toBe(hashing.sha256Hex(second.pdfBytes));
    expect(new TextDecoder().decode(first.pdfBytes.slice(0, 5))).toBe('%PDF-');
  });

  it('draws signer name and timestamp only when those appearances are present', async () => {
    const hashing = createSha256Hashing();
    const pdfBytes = await createTestPdf();
    const flattener = createPdfLibFlattener();
    const nameField = {
      ...FIELD,
      id: '77777777-7777-4777-8777-777777777778',
      type: 'signer_name' as const,
    };
    const dateField = {
      ...FIELD,
      id: '77777777-7777-4777-8777-777777777779',
      type: 'date_signed' as const,
      x: 0.5,
    };
    const result = await flattener.flatten({
      pdfBytes,
      appearances: [
        { field: nameField, pngBytes: null, signerName: 'Alex Signer', signedAt: null },
        {
          field: dateField,
          pngBytes: null,
          signerName: null,
          signedAt: new Date('2026-08-19T12:00:00.000Z'),
        },
      ],
      occurredAt: new Date('2026-08-19T12:00:00.000Z'),
      timeoutMs: 5_000,
    });
    expect(result.pageCount).toBe(1);
    expect(hashing.sha256Hex(result.pdfBytes)).not.toBe(hashing.sha256Hex(pdfBytes));
  });

  it('rejects invalid PDFs and out-of-range pages', async () => {
    const flattener = createPdfLibFlattener();
    await expect(
      flattener.flatten({
        pdfBytes: new TextEncoder().encode('%PDF-1.4\nnot-a-real-pdf'),
        appearances: [],
        occurredAt: new Date('2026-08-19T12:00:00.000Z'),
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const pdfBytes = await createTestPdf();
    await expect(
      flattener.flatten({
        pdfBytes,
        appearances: [
          {
            field: { ...FIELD, pageNumber: 9 },
            pngBytes: createTestPng(),
            signerName: null,
            signedAt: null,
          },
        ],
        occurredAt: new Date('2026-08-19T12:00:00.000Z'),
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
