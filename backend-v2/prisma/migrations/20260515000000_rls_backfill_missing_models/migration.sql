-- ══════════════════════════════════════════════════════════════════════════════
-- RLS backfill — modele dodane po 20260421/20260504, które mają workspaceId,
-- ale nie zostały objęte żadną polityką Row-Level Security.
--
-- Bez tej migracji każdy bug w app-layer scope (np. zapomniany workspaceId
-- filter) może wyciec dane cross-tenant. Druga linia obrony przywrócona dla:
--   ShadowDecision, ClientRiskScore, Task, Delegation, CrmActivity,
--   BackupConfig, ActivityLog, SlaPolicy, WorkspaceModule, WorkspaceSetting,
--   TimeSignal, TimeSlot, FailureCluster, DownloadFile, DownloadPin, PartnerShare
--
-- Dzieci (BackupHistory, FailureClusterMember) — polityka via EXISTS join
-- na rodzica.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Bezpośrednie tabele workspace-scoped ──────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ShadowDecision', 'ClientRiskScore', 'Task', 'Delegation', 'CrmActivity',
    'BackupConfig', 'ActivityLog', 'SlaPolicy', 'WorkspaceModule', 'WorkspaceSetting',
    'TimeSignal', 'TimeSlot', 'FailureCluster',
    'DownloadFile', 'DownloadPin', 'PartnerShare'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skipping RLS enable for %, table not found', t;
      CONTINUE;
    END;
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (app_is_super_admin() OR "workspaceId" = app_current_workspace()) WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace())',
        t || '_tenant', t
      );
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'Policy %_tenant already exists, skipping', t;
    END;
  END LOOP;
END $$;

-- ─── BackupHistory — scoped via BackupConfig ────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "BackupHistory" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "BackupHistory" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "BackupHistory_tenant" ON "BackupHistory" FOR ALL USING (
    app_is_super_admin()
    OR EXISTS (SELECT 1 FROM "BackupConfig" c WHERE c.id = "BackupHistory"."backupConfigId" AND c."workspaceId" = app_current_workspace())
  ) WITH CHECK (
    app_is_super_admin()
    OR EXISTS (SELECT 1 FROM "BackupConfig" c WHERE c.id = "BackupHistory"."backupConfigId" AND c."workspaceId" = app_current_workspace())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── FailureClusterMember — scoped via FailureCluster ───────────────────────
DO $$ BEGIN
  ALTER TABLE "FailureClusterMember" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "FailureClusterMember" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "FailureClusterMember_tenant" ON "FailureClusterMember" FOR ALL USING (
    app_is_super_admin()
    OR EXISTS (SELECT 1 FROM "FailureCluster" fc WHERE fc.id = "FailureClusterMember"."clusterId" AND fc."workspaceId" = app_current_workspace())
  ) WITH CHECK (
    app_is_super_admin()
    OR EXISTS (SELECT 1 FROM "FailureCluster" fc WHERE fc.id = "FailureClusterMember"."clusterId" AND fc."workspaceId" = app_current_workspace())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indeksy wydajnościowe na workspaceId (gdzie brak) ──────────────────────
CREATE INDEX IF NOT EXISTS "Task_workspaceId_idx"           ON "Task"           ("workspaceId");
CREATE INDEX IF NOT EXISTS "Delegation_workspaceId_idx"     ON "Delegation"     ("workspaceId");
CREATE INDEX IF NOT EXISTS "CrmActivity_workspaceId_idx"    ON "CrmActivity"    ("workspaceId");
CREATE INDEX IF NOT EXISTS "TimeSignal_workspaceId_idx"     ON "TimeSignal"     ("workspaceId");
CREATE INDEX IF NOT EXISTS "TimeSlot_workspaceId_idx"       ON "TimeSlot"       ("workspaceId");
CREATE INDEX IF NOT EXISTS "BackupConfig_workspaceId_idx"   ON "BackupConfig"   ("workspaceId");
CREATE INDEX IF NOT EXISTS "DownloadFile_workspaceId_idx"   ON "DownloadFile"   ("workspaceId");
CREATE INDEX IF NOT EXISTS "DownloadPin_workspaceId_idx"    ON "DownloadPin"    ("workspaceId");
CREATE INDEX IF NOT EXISTS "FailureCluster_workspaceId_idx" ON "FailureCluster" ("workspaceId");
CREATE INDEX IF NOT EXISTS "SlaPolicy_workspaceId_idx"      ON "SlaPolicy"      ("workspaceId");
CREATE INDEX IF NOT EXISTS "PartnerShare_workspaceId_idx"   ON "PartnerShare"   ("workspaceId");
CREATE INDEX IF NOT EXISTS "ShadowDecision_workspaceId_idx" ON "ShadowDecision" ("workspaceId");
CREATE INDEX IF NOT EXISTS "ClientRiskScore_workspaceId_idx" ON "ClientRiskScore" ("workspaceId");
CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_idx"    ON "ActivityLog"    ("workspaceId");

-- ─── Grandfather email verification dla istniejących użytkowników ───────────
-- P1.21 wymusi `emailVerified` jako warunek dostępu. Bez tego wszyscy obecni
-- użytkownicy zostaną zablokowani od kolejnej wizyty. Oznaczamy ich jako
-- zweryfikowanych jednorazowo — nowych dotyczy nowe wymaganie.
UPDATE "User"
SET "emailVerified" = true
WHERE "emailVerified" = false
  AND "createdAt" < '2026-05-15'::timestamp
  AND "deletedAt" IS NULL;
