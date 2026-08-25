import { ValidationError, type DocumentInspector } from '@esign/domain';
import { PDF_CONTENT_TYPE, PDF_MAGIC } from './pdf.js';
import { createStructuralDocumentInspector } from './structural-pdf-inspector.js';

/**
 * Marker recognized only by the local-development inspector stub.
 * Production scanners must ignore this string.
 */
export const LOCAL_INSPECTOR_REJECT_MARKER = '%ESIGN-LOCAL-REJECT%';

export type DocumentInspectorName = 'local' | 'fail_closed' | 'structural';

function hasMagic(body: Uint8Array): boolean {
  if (body.byteLength < PDF_MAGIC.byteLength) {
    return false;
  }
  for (let index = 0; index < PDF_MAGIC.byteLength; index += 1) {
    if (body[index] !== PDF_MAGIC[index]) {
      return false;
    }
  }
  return true;
}

function containsMarker(body: Uint8Array, marker: string): boolean {
  const limit = Math.min(body.byteLength, 4096);
  let haystack = '';
  for (let index = 0; index < limit; index += 1) {
    const byte = body[index];
    if (byte === undefined) {
      break;
    }
    haystack += String.fromCharCode(byte);
  }
  return haystack.includes(marker);
}

/**
 * NON-PRODUCTION local document inspector.
 *
 * This stub is not malware scanning and not advanced PDF inspection. It accepts
 * bodies that start with `%PDF-` unless they contain a test-only reject marker.
 * Composition roots must not select this adapter when NODE_ENV is production.
 */
export function createLocalDevelopmentDocumentInspector(): DocumentInspector {
  return {
    async inspect(input) {
      if (input.contentType !== PDF_CONTENT_TYPE || !hasMagic(input.body)) {
        return { status: 'rejected', reasonCode: 'not_pdf' };
      }
      if (containsMarker(input.body, LOCAL_INSPECTOR_REJECT_MARKER)) {
        return { status: 'rejected', reasonCode: 'local_stub_reject_marker' };
      }
      return { status: 'accepted', reasonCode: null };
    },
  };
}

/**
 * Fail-closed inspector used as an ops kill-switch or until structural inspection
 * is enabled. Always rejects. Never fetches URLs or executes document content.
 */
export function createFailClosedDocumentInspector(): DocumentInspector {
  return {
    async inspect() {
      return { status: 'rejected', reasonCode: 'inspector_unconfigured' };
    },
  };
}

export function createDocumentInspector(input: {
  name: DocumentInspectorName;
  nodeEnv: string;
}): DocumentInspector {
  if (input.name === 'local') {
    if (input.nodeEnv === 'production') {
      throw new ValidationError({ reason: 'local_inspector_forbidden_in_production' });
    }
    return createLocalDevelopmentDocumentInspector();
  }
  if (input.name === 'structural') {
    return createStructuralDocumentInspector();
  }
  return createFailClosedDocumentInspector();
}

export { createStructuralDocumentInspector } from './structural-pdf-inspector.js';
