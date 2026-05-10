-- Plug RLS gap on three workspace-scoped tables that were added after the
-- original 20260421010000_rls_policies migration without ENABLE/FORCE/POLICY.
-- Without this, decrypted email body and permission templates can leak across
-- workspaces if any application-layer query forgets the workspaceId filter.

DO $$ BEGIN
  ALTER TABLE "UserEmailAccount" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "UserEmailAccount" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "UserEmailAccount_tenant" ON "UserEmailAccount"
    FOR ALL
    USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
    WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "EmailMessage" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "EmailMessage_tenant" ON "EmailMessage"
    FOR ALL
    USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
    WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PermissionSchema" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "PermissionSchema" FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "PermissionSchema_tenant" ON "PermissionSchema"
    FOR ALL
    USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
    WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
