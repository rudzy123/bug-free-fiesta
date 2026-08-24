import { z } from 'zod';

export const auditVerificationFailureCodeSchema = z.enum([
  'EMPTY_CHAIN',
  'UNSUPPORTED_SCHEMA_VERSION',
  'SEQUENCE_GAP',
  'SEQUENCE_REORDER',
  'HASH_MISMATCH',
  'PREVIOUS_HASH_MISMATCH',
  'GENESIS_PREVIOUS_HASH_MISMATCH',
  'ARTIFACT_DIGEST_MISMATCH',
  'ARTIFACT_MISSING',
  'FORBIDDEN_PAYLOAD_FIELD',
  'CHECKPOINT_MISMATCH',
]);

export const auditVerificationWarningCodeSchema = z.enum([
  'CHECKPOINT_ANCHORING_DISABLED',
  'CHECKPOINT_STORE_UNAVAILABLE',
]);

export const auditVerificationFailureSchema = z
  .object({
    code: auditVerificationFailureCodeSchema,
    organizationId: z.string().uuid(),
    documentId: z.string().uuid(),
    sequence: z.number().int().nullable(),
    eventId: z.string().uuid().nullable(),
  })
  .strict();

export const auditVerificationWarningSchema = z
  .object({
    code: auditVerificationWarningCodeSchema,
    organizationId: z.string().uuid(),
    documentId: z.string().uuid(),
  })
  .strict();

export const auditVerificationReportSchema = z
  .object({
    ok: z.boolean(),
    schemaVersion: z.number().int(),
    organizationId: z.string().uuid(),
    documentId: z.string().uuid(),
    eventCount: z.number().int().nonnegative(),
    checkedAt: z.string().datetime(),
    headEventHash: z.string().length(64).nullable(),
    headSequence: z.number().int().nullable(),
    failures: z.array(auditVerificationFailureSchema),
    warnings: z.array(auditVerificationWarningSchema),
  })
  .strict();

export const organizationAuditVerificationReportSchema = z
  .object({
    ok: z.boolean(),
    organizationId: z.string().uuid(),
    documentCount: z.number().int().nonnegative(),
    failedDocumentCount: z.number().int().nonnegative(),
    checkedAt: z.string().datetime(),
    reports: z.array(auditVerificationReportSchema),
  })
  .strict();

export type AuditVerificationReportResponse = z.infer<typeof auditVerificationReportSchema>;
export type OrganizationAuditVerificationReportResponse = z.infer<
  typeof organizationAuditVerificationReportSchema
>;
