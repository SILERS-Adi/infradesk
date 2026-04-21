-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "ShadowDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "aiOutput" JSONB NOT NULL,
    "humanOutput" JSONB,
    "matched" BOOLEAN,
    "estimatedValue" DECIMAL(10,2),
    "linkedTicketId" TEXT,
    "linkedSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ShadowDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRiskScore" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "trend7d" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "factors" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShadowDecision_workspaceId_feature_createdAt_idx" ON "ShadowDecision"("workspaceId", "feature", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShadowDecision_workspaceId_matched_idx" ON "ShadowDecision"("workspaceId", "matched");

-- CreateIndex
CREATE INDEX "ClientRiskScore_workspaceId_score_idx" ON "ClientRiskScore"("workspaceId", "score");

-- CreateIndex
CREATE INDEX "ClientRiskScore_clientWorkspaceId_computedAt_idx" ON "ClientRiskScore"("clientWorkspaceId", "computedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ClientRiskScore_workspaceId_clientWorkspaceId_computedAt_key" ON "ClientRiskScore"("workspaceId", "clientWorkspaceId", "computedAt");

-- AddForeignKey
ALTER TABLE "ShadowDecision" ADD CONSTRAINT "ShadowDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRiskScore" ADD CONSTRAINT "ClientRiskScore_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enable RLS on new AI-features tables (matches pattern from 20260421010000_rls_policies)
ALTER TABLE "ShadowDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShadowDecision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ShadowDecision_tenant" ON "ShadowDecision" FOR ALL
  USING (app_is_super_admin() OR "workspaceId" = app_current_workspace())
  WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace());

ALTER TABLE "ClientRiskScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientRiskScore" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ClientRiskScore_tenant" ON "ClientRiskScore" FOR ALL
  USING (app_is_super_admin() OR "workspaceId" = app_current_workspace())
  WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infradesk_v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ShadowDecision" TO infradesk_v2_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ClientRiskScore" TO infradesk_v2_app';
  END IF;
END $$;
