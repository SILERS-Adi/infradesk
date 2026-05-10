-- One-time PINs for protected public downloads (RustDesk and friends).

CREATE TABLE "DownloadPin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedFromIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DownloadPin_pin_key" ON "DownloadPin"("pin");
CREATE INDEX "DownloadPin_workspaceId_createdAt_idx" ON "DownloadPin"("workspaceId", "createdAt");
CREATE INDEX "DownloadPin_expiresAt_idx" ON "DownloadPin"("expiresAt");

ALTER TABLE "DownloadPin"
    ADD CONSTRAINT "DownloadPin_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: workspace isolation
ALTER TABLE "DownloadPin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DownloadPin" FORCE ROW LEVEL SECURITY;

CREATE POLICY "DownloadPin_ws_select" ON "DownloadPin" FOR SELECT
    USING ("workspaceId" = app_current_workspace());

CREATE POLICY "DownloadPin_ws_insert" ON "DownloadPin" FOR INSERT
    WITH CHECK ("workspaceId" = app_current_workspace());

CREATE POLICY "DownloadPin_ws_update" ON "DownloadPin" FOR UPDATE
    USING ("workspaceId" = app_current_workspace())
    WITH CHECK ("workspaceId" = app_current_workspace());

CREATE POLICY "DownloadPin_ws_delete" ON "DownloadPin" FOR DELETE
    USING ("workspaceId" = app_current_workspace());
