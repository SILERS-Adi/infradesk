-- ETAP 2 completion: Add workspaceId to 6 models missing workspace isolation
-- Run: npx prisma migrate resolve --applied 20260408_workspace_isolation_complete

-- 1. Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "Notification_workspaceId_idx" ON "Notification"("workspaceId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. PushSubscription
ALTER TABLE "PushSubscription" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "PushSubscription_workspaceId_idx" ON "PushSubscription"("workspaceId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. TechPosition
ALTER TABLE "TechPosition" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "TechPosition_workspaceId_idx" ON "TechPosition"("workspaceId");
ALTER TABLE "TechPosition" ADD CONSTRAINT "TechPosition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. TrustedContact
ALTER TABLE "TrustedContact" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "TrustedContact_workspaceId_idx" ON "TrustedContact"("workspaceId");
ALTER TABLE "TrustedContact" ADD CONSTRAINT "TrustedContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. DownloadPinRequest
ALTER TABLE "DownloadPinRequest" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "DownloadPinRequest_workspaceId_idx" ON "DownloadPinRequest"("workspaceId");
ALTER TABLE "DownloadPinRequest" ADD CONSTRAINT "DownloadPinRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Device compound index
CREATE INDEX IF NOT EXISTS "Device_workspaceId_status_idx" ON "Device"("workspaceId", "status");

-- 8. CrmActivity index
CREATE INDEX IF NOT EXISTS "CrmActivity_linkedTicketId_idx" ON "CrmActivity"("linkedTicketId");

-- 9. Credential visibility index
CREATE INDEX IF NOT EXISTS "Credential_workspaceId_visibility_idx" ON "Credential"("workspaceId", "visibility");

-- Backfill: set workspaceId from user's default membership (optional, run manually if needed)
-- UPDATE "Notification" n SET "workspaceId" = (SELECT wm."workspaceId" FROM "WorkspaceMembership" wm WHERE wm."userId" = n."userId" AND wm."isDefault" = true LIMIT 1) WHERE n."workspaceId" IS NULL;
