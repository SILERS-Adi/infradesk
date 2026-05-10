-- ══════════════════════════════════════════════════════════════════════════════
-- Row-Level Security policies — InfraDesk v2
-- ══════════════════════════════════════════════════════════════════════════════
-- Primary defense: application layer (canAccess + workspaceId scope).
-- RLS = second line of defense.
--
-- Session variables set by middleware/rls.ts:
--   app.current_workspace  text/uuid of active workspace
--   app.current_user       text/uuid of authenticated user
--   app.is_super_admin     '1' = bypass, '0' = normal
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_workspace() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_workspace', true), '');
  $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user', true), '');
  $$;

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('app.is_super_admin', true), '0') = '1';
  $$;

-- Enable RLS on user-facing tables ---------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'Workspace', 'WorkspaceRelation', 'Membership', 'AccessGrant', 'PermissionOverride',
    'Location', 'Device', 'AgentRegistration',
    'Ticket', 'TicketComment', 'TicketEvent', 'Attachment',
    'WorkSession', 'SessionTimeEntry', 'TicketSessionLink',
    'MonitoringAlert', 'Credential', 'CredentialViewLog',
    'Contact', 'Order', 'OrderItem', 'Invoice', 'InvoiceItem',
    'AuditEvent', 'LlmUsage', 'KbArticle', 'VectorEmbedding',
    'MailboxConfig', 'InboundMessage', 'NotificationSubscription',
    'TechnicianLocationLog', 'LocationVisit', 'TechnicianGpsConsent'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Workspace: visible to members + super-admin + current workspace --------
CREATE POLICY "Workspace_select" ON "Workspace" FOR SELECT USING (
  app_is_super_admin()
  OR id = app_current_workspace()
  OR id IN (SELECT "workspaceId" FROM "Membership" WHERE "userId" = app_current_user() AND status = 'ACTIVE')
);
CREATE POLICY "Workspace_modify" ON "Workspace" FOR ALL USING (
  app_is_super_admin() OR id = app_current_workspace()
) WITH CHECK (
  app_is_super_admin() OR id = app_current_workspace()
);

-- Generic workspace-scoped policy (all tables with workspaceId column) ---
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'Location', 'Device', 'AgentRegistration',
    'Ticket', 'WorkSession', 'MonitoringAlert',
    'Credential', 'Contact', 'Order', 'Invoice',
    'AuditEvent', 'LlmUsage', 'KbArticle', 'VectorEmbedding',
    'MailboxConfig', 'Attachment',
    'TechnicianLocationLog', 'LocationVisit', 'TechnicianGpsConsent'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (app_is_super_admin() OR "workspaceId" = app_current_workspace()) WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace())',
      t || '_tenant', t
    );
  END LOOP;
END $$;

-- WorkspaceRelation (provider + client variant) --------------------------
CREATE POLICY "WorkspaceRelation_tenant" ON "WorkspaceRelation" FOR ALL USING (
  app_is_super_admin()
  OR "providerWorkspaceId" = app_current_workspace()
  OR "clientWorkspaceId" = app_current_workspace()
) WITH CHECK (
  app_is_super_admin()
  OR "providerWorkspaceId" = app_current_workspace()
  OR "clientWorkspaceId" = app_current_workspace()
);

-- Membership: user may read own memberships OR any in current workspace --
CREATE POLICY "Membership_tenant" ON "Membership" FOR ALL USING (
  app_is_super_admin()
  OR "userId" = app_current_user()
  OR "workspaceId" = app_current_workspace()
) WITH CHECK (
  app_is_super_admin() OR "workspaceId" = app_current_workspace()
);

CREATE POLICY "AccessGrant_tenant" ON "AccessGrant" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m.id = "AccessGrant"."membershipId" AND m."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m.id = "AccessGrant"."membershipId" AND m."workspaceId" = app_current_workspace())
);

CREATE POLICY "PermissionOverride_tenant" ON "PermissionOverride" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m.id = "PermissionOverride"."membershipId" AND m."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Membership" m WHERE m.id = "PermissionOverride"."membershipId" AND m."workspaceId" = app_current_workspace())
);

-- Ticket children -------------------------------------------------------
CREATE POLICY "TicketComment_tenant" ON "TicketComment" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Ticket" t WHERE t.id = "TicketComment"."ticketId" AND t."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Ticket" t WHERE t.id = "TicketComment"."ticketId" AND t."workspaceId" = app_current_workspace())
);

CREATE POLICY "TicketEvent_tenant" ON "TicketEvent" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Ticket" t WHERE t.id = "TicketEvent"."ticketId" AND t."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Ticket" t WHERE t.id = "TicketEvent"."ticketId" AND t."workspaceId" = app_current_workspace())
);

-- WorkSession children --------------------------------------------------
CREATE POLICY "SessionTimeEntry_tenant" ON "SessionTimeEntry" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "WorkSession" s WHERE s.id = "SessionTimeEntry"."workSessionId" AND s."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "WorkSession" s WHERE s.id = "SessionTimeEntry"."workSessionId" AND s."workspaceId" = app_current_workspace())
);

CREATE POLICY "TicketSessionLink_tenant" ON "TicketSessionLink" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "WorkSession" s WHERE s.id = "TicketSessionLink"."workSessionId" AND s."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "WorkSession" s WHERE s.id = "TicketSessionLink"."workSessionId" AND s."workspaceId" = app_current_workspace())
);

-- Credential child ------------------------------------------------------
CREATE POLICY "CredentialViewLog_tenant" ON "CredentialViewLog" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Credential" c WHERE c.id = "CredentialViewLog"."credentialId" AND c."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Credential" c WHERE c.id = "CredentialViewLog"."credentialId" AND c."workspaceId" = app_current_workspace())
);

-- Order / Invoice items -------------------------------------------------
CREATE POLICY "OrderItem_tenant" ON "OrderItem" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "OrderItem"."orderId" AND o."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "OrderItem"."orderId" AND o."workspaceId" = app_current_workspace())
);

CREATE POLICY "InvoiceItem_tenant" ON "InvoiceItem" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "InvoiceItem"."invoiceId" AND i."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "InvoiceItem"."invoiceId" AND i."workspaceId" = app_current_workspace())
);

-- InboundMessage: scoped via MailboxConfig --------------------------------
CREATE POLICY "InboundMessage_tenant" ON "InboundMessage" FOR ALL USING (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "MailboxConfig" m WHERE m.id = "InboundMessage"."mailboxId" AND m."workspaceId" = app_current_workspace())
) WITH CHECK (
  app_is_super_admin()
  OR EXISTS (SELECT 1 FROM "MailboxConfig" m WHERE m.id = "InboundMessage"."mailboxId" AND m."workspaceId" = app_current_workspace())
);

-- NotificationSubscription: per-user (no workspace scope) ----------------
CREATE POLICY "NotificationSubscription_self" ON "NotificationSubscription" FOR ALL USING (
  app_is_super_admin() OR "userId" = app_current_user()
) WITH CHECK (
  app_is_super_admin() OR "userId" = app_current_user()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Grant app-role privileges (role `infradesk_v2_app` must be pre-created via
-- superuser — see docs/DECISIONS_NEEDED.md). Each GRANT is guarded by a role
-- existence check so the migration succeeds whether or not the role exists.
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infradesk_v2_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO infradesk_v2_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO infradesk_v2_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO infradesk_v2_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO infradesk_v2_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO infradesk_v2_app';
  END IF;
END $$;
