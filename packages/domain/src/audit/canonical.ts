import { createHash } from 'node:crypto';
import { ValidationError } from '../errors.js';
import { AUDIT_GENESIS_PREVIOUS_EVENT_HASH } from '../object-keys.js';

/** Version of the canonical event document that is hashed. Independent of row `id`. */
export const AUDIT_CHAIN_SCHEMA_VERSION = 1;

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

/**
 * Versioned canonical audit event. Hash input is this document after key-sorted
 * JSON serialization: payload, previousEventHash, and schemaVersion are required
 * members; sequence, type, actor, and occurredAt are included so metadata and
 * timestamp tampering is detectable.
 */
export type CanonicalAuditEventV1 = {
  readonly schemaVersion: typeof AUDIT_CHAIN_SCHEMA_VERSION;
  readonly previousEventHash: string;
  readonly sequence: number;
  readonly type: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly payload: CanonicalJson;
};

export type AuditEventHashInput = {
  readonly schemaVersion: number;
  readonly previousEventHash: string;
  readonly sequence: number;
  readonly type: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
};

/**
 * Recursively sorts object keys and drops `undefined` so hashing is independent of
 * insertion order. Dates become UTC ISO-8601. This is a documented subset of JCS,
 * not a claim of RFC 8785 number serialization.
 */
export function canonicalizeJsonValue(value: unknown): CanonicalJson {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError({ reason: 'non_finite_json_number' });
    }
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError({ reason: 'invalid_occurred_at' });
    }
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJsonValue(entry));
  }
  if (typeof value === 'object') {
    if (ArrayBuffer.isView(value)) {
      throw new ValidationError({ reason: 'binary_audit_payload' });
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const canonical: Record<string, CanonicalJson> = {};
    for (const key of keys) {
      const nested = record[key];
      if (nested === undefined) {
        continue;
      }
      canonical[key] = canonicalizeJsonValue(nested);
    }
    return canonical;
  }
  throw new ValidationError({ reason: 'unsupported_json_type', jsonType: typeof value });
}

export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function toCanonicalAuditEventV1(input: AuditEventHashInput): CanonicalAuditEventV1 {
  if (input.schemaVersion !== AUDIT_CHAIN_SCHEMA_VERSION) {
    throw new ValidationError({
      reason: 'unsupported_audit_schema_version',
      schemaVersion: input.schemaVersion,
    });
  }
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new ValidationError({ reason: 'invalid_occurred_at' });
  }
  return {
    actorId: input.actorId,
    actorType: input.actorType,
    occurredAt: input.occurredAt.toISOString(),
    payload: canonicalizeJsonValue(input.payload),
    previousEventHash: input.previousEventHash,
    schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
    sequence: input.sequence,
    type: input.type,
  };
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * SHA-256 of the versioned canonical event. The hashed document always includes
 * the canonical payload, previous event hash, and schema version.
 */
export function computeAuditEventHash(input: AuditEventHashInput): string {
  return sha256Hex(serializeCanonicalJson(toCanonicalAuditEventV1(input)));
}

export function genesisPreviousEventHash(): string {
  return AUDIT_GENESIS_PREVIOUS_EVENT_HASH;
}
