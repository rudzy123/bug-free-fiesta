-- AlterTable
ALTER TABLE "signature_fields" ADD COLUMN "flattenedRevisionId" UUID;

-- CreateIndex
CREATE INDEX "signature_fields_flattened_revision_id_idx" ON "signature_fields"("flattenedRevisionId");
