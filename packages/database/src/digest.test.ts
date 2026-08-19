import { describe, expect, it } from 'vitest';
import {
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  computeAuditEventHash,
  sha256Hex,
  syntheticSha256,
} from './digest.js';

describe('digest helpers', () => {
  it('produces lowercase 64-character SHA-256 hex', () => {
    expect(sha256Hex('esign')).toMatch(/^[0-9a-f]{64}$/);
    expect(syntheticSha256('north-source')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses 64 zero hex characters as the audit genesis previous hash', () => {
    expect(AUDIT_GENESIS_PREVIOUS_EVENT_HASH).toBe(
      '0000000000000000000000000000000000000000000000000000000000000000',
    );
  });

  it('computes a stable audit event hash for the same canonical input', () => {
    const occurredAt = new Date('2026-08-17T12:00:00.000Z');
    const input = {
      previousEventHash: AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
      sequence: 0,
      type: 'document_created',
      actorType: 'account_user',
      actorId: '11111111-1111-4111-8111-111111111111',
      occurredAt,
      payload: { documentId: '22222222-2222-4222-8222-222222222222' },
    };
    expect(computeAuditEventHash(input)).toBe(computeAuditEventHash(input));
    expect(computeAuditEventHash({ ...input, sequence: 1 })).not.toBe(computeAuditEventHash(input));
    expect(
      computeAuditEventHash({
        ...input,
        payload: { extra: true, documentId: '22222222-2222-4222-8222-222222222222' },
      }),
    ).toBe(
      computeAuditEventHash({
        ...input,
        payload: { documentId: '22222222-2222-4222-8222-222222222222', extra: true },
      }),
    );
  });
});
