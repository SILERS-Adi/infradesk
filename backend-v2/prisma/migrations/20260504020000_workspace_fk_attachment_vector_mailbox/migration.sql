-- Plug missing FK + index gaps on three workspace-scoped tables that were
-- created without `workspace Workspace @relation(...)` in schema.prisma.
-- Without these, `DELETE FROM Workspace` left orphans (GDPR + storage leak)
-- and listing per workspace did seq scans.

-- ─────────────────────────── Attachment ───────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Attachment"
    ADD CONSTRAINT "Attachment_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Attachment_workspaceId_idx" ON "Attachment"("workspaceId");
CREATE INDEX IF NOT EXISTS "Attachment_ticketId_idx" ON "Attachment"("ticketId");

-- ─────────────────────────── VectorEmbedding ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "VectorEmbedding"
    ADD CONSTRAINT "VectorEmbedding_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────── MailboxConfig ────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "MailboxConfig"
    ADD CONSTRAINT "MailboxConfig_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "MailboxConfig_workspaceId_idx" ON "MailboxConfig"("workspaceId");
