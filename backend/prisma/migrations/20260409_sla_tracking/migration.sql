-- SLA Tracking migration
-- Run: npx prisma migrate resolve --applied 20260409_sla_tracking

-- 1. Ticket SLA fields
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "slaBreached" BOOLEAN NOT NULL DEFAULT false;

-- 2. SLA Policy table
CREATE TABLE IF NOT EXISTS "SlaPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "responseTimeH" INTEGER NOT NULL,
    "resolveTimeH" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SlaPolicy_workspaceId_priority_key" ON "SlaPolicy"("workspaceId", "priority");
CREATE INDEX IF NOT EXISTS "SlaPolicy_workspaceId_idx" ON "SlaPolicy"("workspaceId");
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Mark already-overdue tickets as breached
UPDATE "Ticket"
SET "slaBreached" = true
WHERE "dueAt" IS NOT NULL
  AND "dueAt" < NOW()
  AND "status" IN ('RESOLVED', 'CLOSED', 'COMPLETED')
  AND "resolvedAt" IS NOT NULL
  AND "resolvedAt" > "dueAt";
