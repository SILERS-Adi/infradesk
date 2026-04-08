-- ETAP 0-2: Audit security fixes migration
-- Run: npx prisma migrate resolve --applied 20260408_audit_security_fixes

-- 1. User: account lockout fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

-- 2. Float → Decimal on financial fields
-- Clean orphaned/invalid floats first
UPDATE "OrderItem" SET "price" = 0 WHERE "price" IS NOT NULL AND "price" != "price"; -- NaN cleanup
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE DECIMAL(12,2);

UPDATE "ShipmentItem" SET "unitPrice" = 0 WHERE "unitPrice" != "unitPrice";
UPDATE "ShipmentItem" SET "totalPrice" = 0 WHERE "totalPrice" != "totalPrice";
ALTER TABLE "ShipmentItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(12,2);
ALTER TABLE "ShipmentItem" ALTER COLUMN "totalPrice" TYPE DECIMAL(12,2);

UPDATE "CrmActivity" SET "quoteValue" = NULL WHERE "quoteValue" IS NOT NULL AND "quoteValue" != "quoteValue";
ALTER TABLE "CrmActivity" ALTER COLUMN "quoteValue" TYPE DECIMAL(12,2);

UPDATE "PackingCustomer" SET "totalSpent" = 0 WHERE "totalSpent" != "totalSpent";
ALTER TABLE "PackingCustomer" ALTER COLUMN "totalSpent" TYPE DECIMAL(12,2);

UPDATE "Subscription" SET "amount" = NULL WHERE "amount" IS NOT NULL AND "amount" != "amount";
ALTER TABLE "Subscription" ALTER COLUMN "amount" TYPE DECIMAL(12,2);

-- 3. Unique constraints per workspace (drop old, add new)
-- First clean any duplicates
-- ticketNumber
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_ticketNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_workspaceId_ticketNumber_key" ON "Ticket"("workspaceId", "ticketNumber");

-- taskNumber
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_taskNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Task_workspaceId_taskNumber_key" ON "Task"("workspaceId", "taskNumber");

-- orderNumber
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Order_workspaceId_orderNumber_key" ON "Order"("workspaceId", "orderNumber");

-- delegationNumber
ALTER TABLE "Delegation" DROP CONSTRAINT IF EXISTS "Delegation_delegationNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Delegation_workspaceId_delegationNumber_key" ON "Delegation"("workspaceId", "delegationNumber");

-- 4. FK constraints on Ticket
-- Clean orphaned data first
UPDATE "Ticket" SET "requesterWorkspaceId" = NULL WHERE "requesterWorkspaceId" IS NOT NULL AND "requesterWorkspaceId" NOT IN (SELECT id FROM "Workspace");
UPDATE "Ticket" SET "providerWorkspaceId" = NULL WHERE "providerWorkspaceId" IS NOT NULL AND "providerWorkspaceId" NOT IN (SELECT id FROM "Workspace");
UPDATE "Ticket" SET "ratedByUserId" = NULL WHERE "ratedByUserId" IS NOT NULL AND "ratedByUserId" NOT IN (SELECT id FROM "User");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterWorkspaceId_fkey" FOREIGN KEY ("requesterWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_providerWorkspaceId_fkey" FOREIGN KEY ("providerWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ratedByUserId_fkey" FOREIGN KEY ("ratedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. New indexes
CREATE INDEX IF NOT EXISTS "Ticket_requesterWorkspaceId_idx" ON "Ticket"("requesterWorkspaceId");
CREATE INDEX IF NOT EXISTS "Ticket_providerWorkspaceId_idx" ON "Ticket"("providerWorkspaceId");
CREATE INDEX IF NOT EXISTS "Device_workspaceId_status_idx" ON "Device"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "CrmActivity_linkedTicketId_idx" ON "CrmActivity"("linkedTicketId");
CREATE INDEX IF NOT EXISTS "Credential_workspaceId_visibility_idx" ON "Credential"("workspaceId", "visibility");
