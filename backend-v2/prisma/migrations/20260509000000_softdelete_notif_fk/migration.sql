-- Soft-delete columns for Order/Invoice/Task — consistency with the rest of the
-- model (Ticket/Device/Location already have deletedAt). Without it, cancellation
-- forces hard-delete (loses audit history) or status=CANCELLED forever (clutter).

ALTER TABLE "Order"   ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task"    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_workspaceId_deletedAt_idx"   ON "Order"  ("workspaceId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Invoice_workspaceId_deletedAt_idx" ON "Invoice"("workspaceId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Task_workspaceId_deletedAt_idx"    ON "Task"   ("workspaceId", "deletedAt");

-- NotificationSubscription FK — orphans po delete user dotąd zostawały.
DO $$ BEGIN
  ALTER TABLE "NotificationSubscription"
    ADD CONSTRAINT "NotificationSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "NotificationSubscription_userId_idx" ON "NotificationSubscription"("userId");
