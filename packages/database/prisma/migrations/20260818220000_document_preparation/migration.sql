-- AlterEnum
ALTER TYPE "document_state" ADD VALUE 'prepared';

-- AlterEnum
ALTER TYPE "signature_field_type" ADD VALUE 'signer_name';

-- CreateEnum
CREATE TYPE "signing_mode" AS ENUM ('ordered', 'parallel');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "signingMode" "signing_mode" NOT NULL DEFAULT 'ordered';

-- AlterTable
ALTER TABLE "document_revisions" ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 1;

-- At most one issued or active signing session per signer.
-- Replaces the (signerId) index created in 20260818000000_initial_data_model with
-- a tenant-scoped (organizationId, signerId) index. Drop the prior index first so
-- the migration is not blocked by the existing relation of the same name.
DROP INDEX IF EXISTS "signing_sessions_one_open_per_signer_idx";
CREATE UNIQUE INDEX "signing_sessions_one_open_per_signer_idx"
ON "signing_sessions" ("organizationId", "signerId")
WHERE "status" IN ('issued', 'active');
