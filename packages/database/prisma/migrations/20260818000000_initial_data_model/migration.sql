-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "document_state" AS ENUM ('draft', 'sent', 'in_progress', 'completed', 'finalizing', 'finalized', 'voided', 'expired', 'declined', 'finalization_failed');

-- CreateEnum
CREATE TYPE "signer_status" AS ENUM ('pending', 'signed', 'declined');

-- CreateEnum
CREATE TYPE "signing_session_status" AS ENUM ('issued', 'active', 'completed', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "signature_field_type" AS ENUM ('signature', 'initials', 'date_signed');

-- CreateEnum
CREATE TYPE "document_revision_kind" AS ENUM ('source', 'intermediate');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('account_user', 'signer', 'worker', 'system');

-- CreateEnum
CREATE TYPE "audit_event_type" AS ENUM ('document_created', 'revision_added', 'fields_updated', 'signers_updated', 'document_sent', 'session_issued', 'session_revoked', 'consent_recorded', 'signer_signed', 'signer_declined', 'document_voided', 'document_expired', 'finalization_started', 'document_finalized', 'finalization_failed', 'artifact_downloaded');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "background_job_status" AS ENUM ('pending', 'leased', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "idempotency_principal_type" AS ENUM ('account_user', 'signer', 'worker', 'system');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ownerMembershipId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "state" "document_state" NOT NULL DEFAULT 'draft',
    "expiresAt" TIMESTAMPTZ,
    "currentRevisionId" UUID,
    "signingRevisionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ,
    "finalizationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "kind" "document_revision_kind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256Digest" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "accountUserId" UUID,
    "routingOrder" INTEGER NOT NULL,
    "status" "signer_status" NOT NULL DEFAULT 'pending',
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ,
    "declinedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_sessions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "signerId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "signing_session_status" NOT NULL DEFAULT 'issued',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "revokedAt" TIMESTAMPTZ,
    "presentationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "failedPresentationCount" INTEGER NOT NULL DEFAULT 0,
    "lastPresentedAt" TIMESTAMPTZ,
    "requestId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "signing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_fields" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "signerId" UUID NOT NULL,
    "type" "signature_field_type" NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "x" DECIMAL(8,7) NOT NULL,
    "y" DECIMAL(8,7) NOT NULL,
    "width" DECIMAL(8,7) NOT NULL,
    "height" DECIMAL(8,7) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMPTZ,
    "completionObjectKey" TEXT,
    "completionContentType" TEXT,
    "completionSizeBytes" BIGINT,
    "completionSha256Digest" CHAR(64),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "signature_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "signerId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "consentCopyId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ NOT NULL,
    "requestId" UUID,
    "untrustedClientIp" TEXT,
    "untrustedUserAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finalized_artifacts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256Digest" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finalized_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "audit_event_type" NOT NULL,
    "actorType" "audit_actor_type" NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "previousEventHash" CHAR(64) NOT NULL,
    "eventHash" CHAR(64) NOT NULL,
    "requestId" UUID,
    "chainVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID,
    "type" TEXT NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "requestId" UUID,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ,
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID,
    "outboxEventId" UUID,
    "type" TEXT NOT NULL,
    "status" "background_job_status" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ,
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "requestId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "principalType" "idempotency_principal_type" NOT NULL,
    "principalId" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestId" UUID,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_id_key" ON "organization_memberships"("organizationId", "id");

-- CreateIndex
CREATE INDEX "documents_organization_id_state_idx" ON "documents"("organizationId", "state");

-- CreateIndex
CREATE INDEX "documents_organization_id_created_at_idx" ON "documents"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_state_expires_at_idx" ON "documents"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "documents_state_lease_until_idx" ON "documents"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "documents_organization_id_id_key" ON "documents"("organizationId", "id");

-- CreateIndex
CREATE INDEX "document_revisions_organization_id_document_id_idx" ON "document_revisions"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "document_revisions_sha256_digest_idx" ON "document_revisions"("sha256Digest");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_organization_id_id_key" ON "document_revisions"("organizationId", "id");

-- CreateIndex
CREATE INDEX "signers_organization_id_document_id_routing_order_idx" ON "signers"("organizationId", "documentId", "routingOrder");

-- CreateIndex
CREATE INDEX "signers_account_user_id_idx" ON "signers"("accountUserId");

-- CreateIndex
CREATE UNIQUE INDEX "signers_organization_id_id_key" ON "signers"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "signing_sessions_tokenHash_key" ON "signing_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "signing_sessions_organization_id_document_id_signer_id_idx" ON "signing_sessions"("organizationId", "documentId", "signerId");

-- CreateIndex
CREATE INDEX "signing_sessions_signer_id_status_idx" ON "signing_sessions"("signerId", "status");

-- CreateIndex
CREATE INDEX "signing_sessions_expires_at_status_idx" ON "signing_sessions"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signing_sessions_organization_id_id_key" ON "signing_sessions"("organizationId", "id");

-- CreateIndex
CREATE INDEX "signature_fields_organization_id_document_id_signer_id_idx" ON "signature_fields"("organizationId", "documentId", "signerId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_fields_organization_id_id_key" ON "signature_fields"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_sessionId_key" ON "consent_records"("sessionId");

-- CreateIndex
CREATE INDEX "consent_records_organization_id_document_id_idx" ON "consent_records"("organizationId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "finalized_artifacts_documentId_key" ON "finalized_artifacts"("documentId");

-- CreateIndex
CREATE INDEX "finalized_artifacts_sha256_digest_idx" ON "finalized_artifacts"("sha256Digest");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_document_id_sequence_idx" ON "audit_logs"("organizationId", "documentId", "sequence");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_document_id_sequence_key" ON "audit_logs"("documentId", "sequence");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_document_id_idx" ON "outbox_events"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "outbox_events_request_id_idx" ON "outbox_events"("requestId");

-- CreateIndex
CREATE INDEX "background_jobs_status_available_at_idx" ON "background_jobs"("status", "availableAt");

-- CreateIndex
CREATE INDEX "background_jobs_organization_id_document_id_idx" ON "background_jobs"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "background_jobs_outbox_event_id_idx" ON "background_jobs"("outboxEventId");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_records_request_id_idx" ON "idempotency_records"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_org_principal_route_key_key" ON "idempotency_records"("organizationId", "principalId", "route", "key");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_ownerMembershipId_fkey" FOREIGN KEY ("organizationId", "ownerMembershipId") REFERENCES "organization_memberships"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_currentRevisionId_fkey" FOREIGN KEY ("organizationId", "currentRevisionId") REFERENCES "document_revisions"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_signingRevisionId_fkey" FOREIGN KEY ("organizationId", "signingRevisionId") REFERENCES "document_revisions"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signers" ADD CONSTRAINT "signers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signers" ADD CONSTRAINT "signers_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signers" ADD CONSTRAINT "signers_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_organizationId_signerId_fkey" FOREIGN KEY ("organizationId", "signerId") REFERENCES "signers"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_organizationId_signerId_fkey" FOREIGN KEY ("organizationId", "signerId") REFERENCES "signers"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organizationId_signerId_fkey" FOREIGN KEY ("organizationId", "signerId") REFERENCES "signers"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organizationId_sessionId_fkey" FOREIGN KEY ("organizationId", "sessionId") REFERENCES "signing_sessions"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finalized_artifacts" ADD CONSTRAINT "finalized_artifacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finalized_artifacts" ADD CONSTRAINT "finalized_artifacts_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints (Prisma schema cannot express these CHECKs in 6.8)

ALTER TABLE "document_revisions"
  ADD CONSTRAINT "document_revisions_sha256_hex"
  CHECK ("sha256Digest" ~ '^[0-9a-f]{64}$');

ALTER TABLE "document_revisions"
  ADD CONSTRAINT "document_revisions_positive_size"
  CHECK ("sizeBytes" > 0);

ALTER TABLE "finalized_artifacts"
  ADD CONSTRAINT "finalized_artifacts_sha256_hex"
  CHECK ("sha256Digest" ~ '^[0-9a-f]{64}$');

ALTER TABLE "finalized_artifacts"
  ADD CONSTRAINT "finalized_artifacts_positive_size"
  CHECK ("sizeBytes" > 0);

ALTER TABLE "signature_fields"
  ADD CONSTRAINT "signature_fields_page_number"
  CHECK ("pageNumber" >= 1);

ALTER TABLE "signature_fields"
  ADD CONSTRAINT "signature_fields_normalized_box"
  CHECK (
    "x" >= 0 AND "x" <= 1
    AND "y" >= 0 AND "y" <= 1
    AND "width" > 0 AND "width" <= 1
    AND "height" > 0 AND "height" <= 1
    AND "x" + "width" <= 1
    AND "y" + "height" <= 1
  );

ALTER TABLE "signature_fields"
  ADD CONSTRAINT "signature_fields_completion_sha256_hex"
  CHECK ("completionSha256Digest" IS NULL OR "completionSha256Digest" ~ '^[0-9a-f]{64}$');

ALTER TABLE "signature_fields"
  ADD CONSTRAINT "signature_fields_completion_positive_size"
  CHECK ("completionSizeBytes" IS NULL OR "completionSizeBytes" > 0);

ALTER TABLE "signers"
  ADD CONSTRAINT "signers_nonnegative_routing_order"
  CHECK ("routingOrder" >= 0);

ALTER TABLE "signing_sessions"
  ADD CONSTRAINT "signing_sessions_token_hash_hex"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "signing_sessions"
  ADD CONSTRAINT "signing_sessions_nonnegative_attempts"
  CHECK ("presentationAttemptCount" >= 0 AND "failedPresentationCount" >= 0);

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_sha256_hex"
  CHECK (
    "previousEventHash" ~ '^[0-9a-f]{64}$'
    AND "eventHash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_nonnegative_sequence"
  CHECK ("sequence" >= 0);

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_request_hash_hex"
  CHECK ("requestHash" ~ '^[0-9a-f]{64}$');

-- At most one issued or active signing session per signer (re-issue must revoke first).
CREATE UNIQUE INDEX "signing_sessions_one_open_per_signer_idx"
  ON "signing_sessions" ("signerId")
  WHERE "status" IN ('issued', 'active');

-- Append-only audit: application and database roles must not UPDATE or DELETE rows.
CREATE FUNCTION audit_logs_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_forbid_mutation();


