import { ValidationError } from '../errors.js';

/**
 * Keys that must never appear in an audit payload. Matching is against the
 * alphanumeric-normalized key so `bearer_token` and `bearerToken` are equivalent.
 * Hashes such as `signaturePngSha256` are allowed; raw images and tokens are not.
 */
const FORBIDDEN_SUBSTRINGS = [
  'token',
  'secret',
  'password',
  'cookie',
  'authorization',
  'bearer',
  'apikey',
  'csrftoken',
  'sessiontoken',
  'signatureimage',
  'signaturebytes',
  'pngbytes',
  'pdfbytes',
  'documentbytes',
  'pointerstream',
  'rawsignature',
] as const;

const FORBIDDEN_EXACT = new Set([
  'email',
  'name',
  'phone',
  'address',
  'ssn',
  'png',
  'pdf',
  'pointer',
  'strokes',
  'ink',
  'raw',
]);

const MAX_STRING_CHARS = 4_096;
const MAX_DEPTH = 8;
const MAX_KEYS = 64;

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (FORBIDDEN_EXACT.has(normalized)) {
    return true;
  }
  return FORBIDDEN_SUBSTRINGS.some((part) => normalized.includes(part));
}

function assertApprovedValue(value: unknown, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new ValidationError({ reason: 'audit_payload_too_deep' });
  }
  if (value === null) {
    return;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ValidationError({ reason: 'non_finite_json_number' });
    }
    return;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_CHARS) {
      throw new ValidationError({ reason: 'audit_payload_string_too_long' });
    }
    return;
  }
  if (value instanceof Date) {
    return;
  }
  if (ArrayBuffer.isView(value)) {
    throw new ValidationError({ reason: 'binary_audit_payload' });
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) {
      throw new ValidationError({ reason: 'audit_payload_too_large' });
    }
    for (const entry of value) {
      assertApprovedValue(entry, depth + 1);
    }
    return;
  }
  if (typeof value === 'object') {
    assertApprovedAuditPayload(value as Record<string, unknown>, depth + 1);
    return;
  }
  throw new ValidationError({ reason: 'unsupported_json_type', jsonType: typeof value });
}

/**
 * Rejects secrets, raw signature images, pointer streams, PDF bytes, cookies,
 * bearer tokens, and unnecessary personal data. Callers must pass opaque ids
 * and policy-approved metadata only (for example untrusted IP/UA, consent copy
 * ids, and content hashes). Emails and display names are not approved.
 */
export function assertApprovedAuditPayload(
  payload: Readonly<Record<string, unknown>>,
  depth = 0,
): void {
  if (depth > MAX_DEPTH) {
    throw new ValidationError({ reason: 'audit_payload_too_deep' });
  }
  const keys = Object.keys(payload);
  if (keys.length > MAX_KEYS) {
    throw new ValidationError({ reason: 'audit_payload_too_large' });
  }
  for (const key of keys) {
    if (isForbiddenKey(key)) {
      throw new ValidationError({ field: key, reason: 'forbidden_audit_payload_key' });
    }
    const nested = payload[key];
    if (nested === undefined) {
      continue;
    }
    assertApprovedValue(nested, depth + 1);
  }
}
