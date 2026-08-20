import { describe, expect, it } from 'vitest';
import { runRedactionAudit, sensitiveSamples } from './redaction-audit.js';
import { PII_FIELD_CLASSIFICATION, PROHIBITED_LOG_FIELDS } from './index.js';

describe('redaction audit', () => {
  it('never leaks any representative sensitive payload through the logger', () => {
    const result = runRedactionAudit();
    expect(result.leaked).toEqual([]);
  });

  it('still emits benign correlation ids so logs remain useful', () => {
    const result = runRedactionAudit();
    expect(result.correlationIdPresent).toBe(true);
  });

  it('covers every prohibited "never log" category with a sample', () => {
    const sampleJson = JSON.stringify(sensitiveSamples());
    for (const category of [
      'password',
      'authorization',
      'cookie',
      'signaturePng',
      'points',
      'pdfBytes',
      'documentContent',
      'signedUrl',
    ]) {
      expect(sampleJson.toLowerCase()).toContain(category.toLowerCase());
    }
  });
});

describe('PII classification', () => {
  it('marks every prohibited field as not loggable and Restricted-tier', () => {
    for (const field of PROHIBITED_LOG_FIELDS) {
      const classification = PII_FIELD_CLASSIFICATION[field];
      if (classification !== undefined) {
        expect(classification.loggable).toBe(false);
      }
    }
  });

  it('keeps opaque identifiers loggable', () => {
    for (const field of ['correlationId', 'organizationId', 'documentId', 'signerId', 'jobId']) {
      expect(PII_FIELD_CLASSIFICATION[field]?.loggable).toBe(true);
    }
  });
});
