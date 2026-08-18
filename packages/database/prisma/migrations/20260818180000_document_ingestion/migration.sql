-- Document ingestion: inspection status, sanitized display names,
-- hashed upload sessions, and short-lived preview grants.

CREATE TYPE "document_inspection_status" AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE "upload_session_status" AS ENUM ('issued', 'completed', 'expired', 'abandoned');

ALTER TYPE "audit_event_type" ADD VALUE 'inspection_accepted';
ALTER TYPE "audit_event_type" ADD VALUE 'inspection_rejected';
ALTER TYPE "audit_event_type" ADD VALUE 'upload_abandoned';

ALTER TABLE "documents"
  ADD COLUMN "inspectionStatus" "document_inspection_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "sourceDisplayName" TEXT;

ALTER TABLE "document_revisions"
  ADD COLUMN "displayName" TEXT NOT NULL DEFAULT 'document.pdf';

CREATE TABLE "upload_sessions" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "upload_session_status" NOT NULL DEFAULT 'issued',
  "displayName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "maxBytes" BIGINT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "completedAt" TIMESTAMPTZ,
  "revisionId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_sessions_tokenHash_key" ON "upload_sessions"("tokenHash");
CREATE UNIQUE INDEX "upload_sessions_organization_id_id_key" ON "upload_sessions"("organizationId", "id");
CREATE INDEX "upload_sessions_organization_id_document_id_idx" ON "upload_sessions"("organizationId", "documentId");
CREATE INDEX "upload_sessions_status_expires_at_idx" ON "upload_sessions"("status", "expiresAt");

ALTER TABLE "upload_sessions"
  ADD CONSTRAINT "upload_sessions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "upload_sessions"
  ADD CONSTRAINT "upload_sessions_organizationId_documentId_fkey"
  FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "upload_sessions"
  ADD CONSTRAINT "upload_sessions_token_hash_hex"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "upload_sessions"
  ADD CONSTRAINT "upload_sessions_positive_max_bytes"
  CHECK ("maxBytes" > 0);

CREATE TABLE "preview_grants" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "revisionId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "preview_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preview_grants_tokenHash_key" ON "preview_grants"("tokenHash");
CREATE UNIQUE INDEX "preview_grants_organization_id_id_key" ON "preview_grants"("organizationId", "id");
CREATE INDEX "preview_grants_expires_at_idx" ON "preview_grants"("expiresAt");

ALTER TABLE "preview_grants"
  ADD CONSTRAINT "preview_grants_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preview_grants"
  ADD CONSTRAINT "preview_grants_organizationId_documentId_fkey"
  FOREIGN KEY ("organizationId", "documentId") REFERENCES "documents"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preview_grants"
  ADD CONSTRAINT "preview_grants_token_hash_hex"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
