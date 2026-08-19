import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import { AUDIT_GENESIS_PREVIOUS_EVENT_HASH } from '../object-keys.js';
import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  canonicalizeJsonValue,
  computeAuditEventHash,
  serializeCanonicalJson,
  toCanonicalAuditEventV1,
} from './canonical.js';

const BASE = {
  schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
  previousEventHash: AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  sequence: 0,
  type: 'document_created',
  actorType: 'account_user',
  actorId: '11111111-1111-4111-8111-111111111111',
  occurredAt: new Date('2026-08-19T12:00:00.000Z'),
  payload: { documentId: '44444444-4444-4444-8444-444444444444' },
};

describe('canonical audit hashing', () => {
  it('includes schema version, previous hash, and canonical payload in the hashed document', () => {
    const canonical = toCanonicalAuditEventV1(BASE);
    expect(canonical.schemaVersion).toBe(1);
    expect(canonical.previousEventHash).toBe(AUDIT_GENESIS_PREVIOUS_EVENT_HASH);
    expect(canonical.payload).toEqual({ documentId: BASE.payload.documentId });
    expect(serializeCanonicalJson(canonical)).toContain('"schemaVersion":1');
  });

  it('is independent of object key insertion order', () => {
    const left = computeAuditEventHash({
      ...BASE,
      payload: { b: 2, a: 1 },
    });
    const right = computeAuditEventHash({
      ...BASE,
      payload: { a: 1, b: 2 },
    });
    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when metadata, timestamps, payload, previous hash, or schema version change', () => {
    const baseline = computeAuditEventHash(BASE);
    expect(computeAuditEventHash({ ...BASE, type: 'document_sent' })).not.toBe(baseline);
    expect(
      computeAuditEventHash({ ...BASE, actorId: '22222222-2222-4222-8222-222222222222' }),
    ).not.toBe(baseline);
    expect(
      computeAuditEventHash({ ...BASE, occurredAt: new Date('2026-08-19T12:00:01.000Z') }),
    ).not.toBe(baseline);
    expect(computeAuditEventHash({ ...BASE, payload: { documentId: 'other' } })).not.toBe(baseline);
    expect(computeAuditEventHash({ ...BASE, previousEventHash: 'a'.repeat(64) })).not.toBe(
      baseline,
    );
    expect(() => computeAuditEventHash({ ...BASE, schemaVersion: 2 })).toThrow(ValidationError);
  });

  it('sorts nested keys and drops undefined', () => {
    expect(canonicalizeJsonValue({ z: 1, a: { d: 4, c: 3 }, skip: undefined })).toEqual({
      a: { c: 3, d: 4 },
      z: 1,
    });
  });

  it('rejects binary payloads and non-finite numbers', () => {
    expect(() => canonicalizeJsonValue(new Uint8Array([1]))).toThrow(ValidationError);
    expect(() => canonicalizeJsonValue(Number.NaN)).toThrow(ValidationError);
  });
});
