import { describe, expect, it } from 'vitest';
import { parseVerifyAuditArgs } from './verify-audit-args.js';

describe('verify-audit CLI', () => {
  it('requires an organization id and accepts an optional document id', () => {
    expect(() => parseVerifyAuditArgs([])).toThrow(/organization-id/);
    expect(
      parseVerifyAuditArgs([
        '--organization-id',
        '11111111-1111-4111-8111-111111111111',
        '--document-id=44444444-4444-4444-8444-444444444444',
      ]),
    ).toEqual({
      organizationId: '11111111-1111-4111-8111-111111111111',
      documentId: '44444444-4444-4444-8444-444444444444',
    });
  });
});
