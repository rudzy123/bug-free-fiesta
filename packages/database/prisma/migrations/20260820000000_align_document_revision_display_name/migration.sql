-- The `displayName` column was added to `document_revisions` in
-- 20260818180000_document_ingestion with a temporary DEFAULT 'document.pdf' so a
-- NOT NULL column could be added to existing rows. The application always
-- supplies the display name, and schema.prisma declares no default, so drop the
-- lingering default to keep the database in sync with the Prisma schema.
ALTER TABLE "document_revisions" ALTER COLUMN "displayName" DROP DEFAULT;
