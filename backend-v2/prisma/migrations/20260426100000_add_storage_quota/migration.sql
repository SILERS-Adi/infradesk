-- Add storage quota to Workspace
ALTER TABLE "Workspace" ADD COLUMN "storageQuotaBytes" BIGINT;

-- Default 5 GiB for existing CLIENT workspaces; MSP/INTERNAL_IT remain unlimited (NULL).
UPDATE "Workspace" SET "storageQuotaBytes" = 5368709120 WHERE "type" = 'CLIENT' AND "storageQuotaBytes" IS NULL;
