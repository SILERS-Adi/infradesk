-- ══════════════════════════════════════════════════════════════════════════════
-- Payment model — trwały audit trail każdej zaakceptowanej płatności + database
-- level idempotency dla webhooków Paynow.
--
-- Przed tą migracją idempotency opierał się o `activityLog.findFirst({
-- metadata.paymentId })` z `.catch swallow` przy logActivity — race condition
-- mogło wywołać podwójną aktywację planu. Unique constraint `paymentId` daje
-- twardą gwarancję single-activation.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TYPE "PaymentStatus" AS ENUM (
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'ABANDONED',
  'REFUNDED'
);

CREATE TABLE "Payment" (
  "id"           TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "paymentId"    TEXT NOT NULL,
  "paynowId"     TEXT,
  "externalId"   TEXT,
  "amountGrosze" INTEGER NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'PLN',
  "status"       "PaymentStatus" NOT NULL,
  "plan"         "Plan",
  "cycle"        TEXT,
  "periodMonths" INTEGER,
  "metadata"     JSONB,
  "paidAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_paymentId_key" ON "Payment" ("paymentId");
CREATE INDEX "Payment_workspaceId_idx" ON "Payment" ("workspaceId");
CREATE INDEX "Payment_status_idx" ON "Payment" ("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment" ("createdAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── RLS — webhook biegnie z prismaBg (BYPASSRLS), ale interfejsy admin/owner
-- czytają historię płatności przez `prisma` (z RLS). Polityka standardowa: tylko
-- aktualny workspace albo super-admin.
DO $$ BEGIN
  ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Payment_tenant" ON "Payment" FOR ALL USING (
    app_is_super_admin() OR "workspaceId" = app_current_workspace()
  ) WITH CHECK (
    app_is_super_admin() OR "workspaceId" = app_current_workspace()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
