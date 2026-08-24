import { describe, expect, it } from 'vitest';
import { auditVerificationReportSchema } from './audit.js';

describe('audit verification contracts', () => {
  it('accepts a typed verification report', () => {
    const parsed = auditVerificationReportSchema.parse({
      ok: false,
      schemaVersion: 1,
      organizationId: '11111111-1111-4111-8111-111111111111',
      documentId: '44444444-4444-4444-8444-444444444444',
      eventCount: 0,
      checkedAt: '2026-08-19T12:00:00.000Z',
      headEventHash: null,
      headSequence: null,
      failures: [
        {
          code: 'EMPTY_CHAIN',
          organizationId: '11111111-1111-4111-8111-111111111111',
          documentId: '44444444-4444-4444-8444-444444444444',
          sequence: null,
          eventId: null,
        },
      ],
      warnings: [],
    });
    expect(parsed.ok).toBe(false);
  });
});
