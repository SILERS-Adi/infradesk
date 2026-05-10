-- Partner IT — czasowe share linki dla zewnętrznych firm-partnerów.

CREATE TYPE "PartnerShareResource" AS ENUM ('DEVICE', 'CREDENTIAL', 'RUSTDESK_LAUNCH');

CREATE TABLE "PartnerShare" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" "PartnerShareResource" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "shareTokenHash" TEXT NOT NULL,
    "partnerEmail" TEXT,
    "partnerName" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedFromIp" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerShare_shareToken_key" ON "PartnerShare"("shareToken");
CREATE UNIQUE INDEX "PartnerShare_shareTokenHash_key" ON "PartnerShare"("shareTokenHash");
CREATE INDEX "PartnerShare_workspaceId_createdAt_idx" ON "PartnerShare"("workspaceId", "createdAt");
CREATE INDEX "PartnerShare_expiresAt_idx" ON "PartnerShare"("expiresAt");

ALTER TABLE "PartnerShare"
    ADD CONSTRAINT "PartnerShare_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: workspace isolation
ALTER TABLE "PartnerShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerShare" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PartnerShare_ws_select" ON "PartnerShare" FOR SELECT
    USING ("workspaceId" = app_current_workspace());

CREATE POLICY "PartnerShare_ws_insert" ON "PartnerShare" FOR INSERT
    WITH CHECK ("workspaceId" = app_current_workspace());

CREATE POLICY "PartnerShare_ws_update" ON "PartnerShare" FOR UPDATE
    USING ("workspaceId" = app_current_workspace())
    WITH CHECK ("workspaceId" = app_current_workspace());

CREATE POLICY "PartnerShare_ws_delete" ON "PartnerShare" FOR DELETE
    USING ("workspaceId" = app_current_workspace());

-- Grants — bg user (BYPASSRLS) potrzebuje INSERT/UPDATE z webhook'a public access endpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "PartnerShare" TO infradesk_v2_bg;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PartnerShare" TO infradesk_v2;
