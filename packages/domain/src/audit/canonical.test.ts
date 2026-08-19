import { describe, expect, it } from 'vitest';
import { AUDIT_GENESIS_PREVIOUS_EVENT_HASH } from '../object-keys.js';
import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  canonicalizeJsonValue,
  computeAuditEventHash,
  serializeCanonicalJson,
} from './canonical.js';

const BASE = {
  schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
  previousEventHash: AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  sequence: 0,
  type: 'document_created',
  actorType: 'account_user',
  actorId: '11111111-1111-4111-8111-111111111111',
  occurredAt: new Date('2026-08-17T12:00:00.000Z'),
  payload: { documentId: '22222222-2222-4222-8222-222222222222' },
} as const;

describe('canonical audit hashing', () => {
  it('is stable for the same input and includes schema version', () => {
    expect(computeAuditEventHash(BASE)).toBe(computeAuditEventHash({ ...BASE }));
    expect(computeAuditEventHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sorts nested object keys before hashing', () => {
    const left = serializeCanonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const right = serializeCanonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(left).toBe(right);
    expect(canonicalizeJsonValue({ z: 1, a: 2 })).toEqual({ a: 2, z: 1 });
  });

  it('changes when payload metadata changes', () => {
    expect(
      computeAuditEventHash({ ...BASE, payload: { documentId: BASE.payload.documentId, extra: 1 } }),
    ).not.toBe(computeAuditEventHash(BASE));
  });

  it('changes when occurredAt changes', () => {
    expect(
      computeAuditEventHash({ ...BASE, occurredAt: new Date('2026-08-17T12:00:01.000Z') }),
    ).not.toBe(computeAuditEventHash(BASE));
  });

  it('changes when previous hash or schema version would differ', () => {
    expect(
      computeAuditEventHash({ ...BASE, previousEventHash: 'a'.repeat(64) }),
    ).not.toBe(computeAuditEventHash(BASE));
  });
});
