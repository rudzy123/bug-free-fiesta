import type { DocumentInspector, DocumentInspectionOutcome } from '@esign/domain';
import { PDF_CONTENT_TYPE, PDF_MAGIC } from './pdf.js';

const MAX_LEADING_WHITESPACE = 1024;
const EOF_TAIL_BYTES = 2048;

/**
 * PDF name tokens that enable active content, remote fetch, or opaque payloads.
 * This is structural denial — not antivirus. Residual risk remains for novel
 * encodings and library zero-days.
 */
const FORBIDDEN_NAME_CHECKS: ReadonlyArray<{
  readonly reasonCode: string;
  readonly matches: (latin1: string) => boolean;
}> = [
  {
    reasonCode: 'pdf_javascript',
    matches: (s) =>
      includesPdfName(s, 'JavaScript') ||
      includesPdfName(s, 'JS') ||
      s.includes('/#4A#61#76#61#53#63#72#69#70#74') ||
      s.includes('/#4a#61#76#61#53#63#72#69#70#74'),
  },
  {
    reasonCode: 'pdf_open_action',
    matches: (s) => includesPdfName(s, 'OpenAction'),
  },
  {
    reasonCode: 'pdf_aa',
    matches: (s) => includesPdfName(s, 'AA'),
  },
  {
    reasonCode: 'pdf_launch',
    matches: (s) => includesPdfName(s, 'Launch'),
  },
  {
    reasonCode: 'pdf_embedded_file',
    matches: (s) => includesPdfName(s, 'EmbeddedFile') || includesPdfName(s, 'EmbeddedFiles'),
  },
  {
    reasonCode: 'pdf_rich_media',
    matches: (s) => includesPdfName(s, 'RichMedia'),
  },
  {
    reasonCode: 'pdf_xfa',
    matches: (s) => includesPdfName(s, 'XFA'),
  },
  {
    reasonCode: 'pdf_submit_form',
    matches: (s) => includesPdfName(s, 'SubmitForm'),
  },
  {
    reasonCode: 'pdf_import_data',
    matches: (s) => includesPdfName(s, 'ImportData'),
  },
  {
    reasonCode: 'pdf_goto_remote',
    matches: (s) => includesPdfName(s, 'GoToR'),
  },
  {
    reasonCode: 'pdf_encrypt',
    matches: (s) => includesPdfName(s, 'Encrypt'),
  },
];

function isPdfWhitespace(byte: number): boolean {
  return (
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function matchesMagicAt(body: Uint8Array, offset: number): boolean {
  if (offset + PDF_MAGIC.byteLength > body.byteLength) {
    return false;
  }
  for (let index = 0; index < PDF_MAGIC.byteLength; index += 1) {
    if (body[offset + index] !== PDF_MAGIC[index]) {
      return false;
    }
  }
  return true;
}

/**
 * PDF headers may be preceded by limited whitespace. Any other leading bytes
 * (HTML/polyglot prefixes) are rejected.
 */
export function findPdfMagicOffset(body: Uint8Array): number | null {
  let index = 0;
  while (index < body.byteLength && index < MAX_LEADING_WHITESPACE) {
    const byte = body[index];
    if (byte === undefined) {
      return null;
    }
    if (matchesMagicAt(body, index)) {
      return index;
    }
    if (!isPdfWhitespace(byte)) {
      return null;
    }
    index += 1;
  }
  return matchesMagicAt(body, index) ? index : null;
}

function hasEofMarker(body: Uint8Array): boolean {
  const start = Math.max(0, body.byteLength - EOF_TAIL_BYTES);
  const tail = latin1Slice(body, start, body.byteLength);
  return tail.includes('%%EOF');
}

function latin1Slice(body: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let index = start; index < end; index += 1) {
    const byte = body[index];
    if (byte === undefined) {
      break;
    }
    out += String.fromCharCode(byte);
  }
  return out;
}

function includesPdfName(haystack: string, name: string): boolean {
  const token = `/${name}`;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(token, from);
    if (at === -1) {
      return false;
    }
    const after = haystack.charCodeAt(at + token.length);
    // PDF name terminator: end, whitespace, or delimiter (not another name char).
    if (
      Number.isNaN(after) ||
      after <= 0x20 ||
      after === 0x28 || // (
      after === 0x29 || // )
      after === 0x3c || // <
      after === 0x3e || // >
      after === 0x5b || // [
      after === 0x5d || // ]
      after === 0x7b || // {
      after === 0x7d || // }
      after === 0x2f || // /
      after === 0x25 // %
    ) {
      return true;
    }
    from = at + token.length;
  }
  return false;
}

export function inspectPdfStructure(input: {
  contentType: string;
  body: Uint8Array;
}): DocumentInspectionOutcome {
  if (input.contentType !== PDF_CONTENT_TYPE) {
    return { status: 'rejected', reasonCode: 'not_pdf' };
  }
  if (findPdfMagicOffset(input.body) === null) {
    return { status: 'rejected', reasonCode: 'not_pdf' };
  }
  if (!hasEofMarker(input.body)) {
    return { status: 'rejected', reasonCode: 'pdf_missing_eof' };
  }

  const latin1 = latin1Slice(input.body, 0, input.body.byteLength);
  for (const check of FORBIDDEN_NAME_CHECKS) {
    if (check.matches(latin1)) {
      return { status: 'rejected', reasonCode: check.reasonCode };
    }
  }
  return { status: 'accepted', reasonCode: null };
}

/**
 * Production-capable structural PDF inspector.
 *
 * Rejects non-PDFs and documents that declare active/dangerous PDF features.
 * Does not claim malware detection and never executes or fetches document content.
 */
export function createStructuralDocumentInspector(): DocumentInspector {
  return {
    async inspect(input) {
      return inspectPdfStructure({
        contentType: input.contentType,
        body: input.body,
      });
    },
  };
}
