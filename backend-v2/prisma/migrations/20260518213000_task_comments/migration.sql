-- TaskComment — parallel do TicketComment, dodaje komentarze do zadań.
-- User pain point 2026-05-18: "nie dziala prawidlo zadania" — nie ma jak
-- opisać "zrobiłem X, zostało Y" na zadaniu.
--
-- Idempotentne: CREATE TABLE IF NOT EXISTS + bezpieczne ALTER + RLS via DO bloku.

CREATE TABLE IF NOT EXISTS "TaskComment" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "taskId"      TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "comment"     TEXT NOT NULL,
  "isInternal"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskComment_taskId_idx"      ON "TaskComment"("taskId");
CREATE INDEX IF NOT EXISTS "TaskComment_workspaceId_idx" ON "TaskComment"("workspaceId");

-- FK do Task, User, Workspace
DO $$ BEGIN
  ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TaskComment"
    ADD CONSTRAINT "TaskComment_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS — wzorzec z innych tabel workspace-scoped:
--   - super-admin widzi wszystko (NOBYPASSRLS user nie matchuje, ale CHECK matchuje)
--   - workspace member widzi swoje
--   - MSP provider widzi taski klienta jeśli relacja ACTIVE + canViewTickets
ALTER TABLE "TaskComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskComment" FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "TaskComment_tenant" ON "TaskComment";
END $$;

-- workspaceId denormalizowany w TaskComment, więc nie potrzeba EXISTS-joina do Task.
-- Cross-workspace MSP (provider widzi taski klienta): policy ticket-style nie obsługuje,
-- ale Task.routes.ts używa resolveAccessibleWorkspaceIds dla cross-ws GET — kontroler
-- musi w analogiczny sposób walidować workspaceId przy POST /tasks/:id/comments.
CREATE POLICY "TaskComment_tenant" ON "TaskComment"
  USING (
    app_is_super_admin()
    OR "workspaceId" = app_current_workspace()
    OR "workspaceId" IN (
      SELECT r."clientWorkspaceId"
      FROM "WorkspaceRelation" r
      WHERE r."providerWorkspaceId" = app_current_workspace()
        AND r."canViewDevices" = true
        AND r.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    app_is_super_admin()
    OR "workspaceId" = app_current_workspace()
  );
