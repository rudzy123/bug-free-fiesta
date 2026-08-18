-- AlterEnum
ALTER TYPE "audit_event_type" ADD VALUE 'session_exchanged';

-- AlterEnum
ALTER TYPE "audit_event_type" ADD VALUE 'document_viewed';

-- AlterTable
ALTER TABLE "signing_sessions" ADD COLUMN "csrfTokenHash" CHAR(64);
