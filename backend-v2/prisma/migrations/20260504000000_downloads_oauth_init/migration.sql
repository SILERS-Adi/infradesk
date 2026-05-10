-- Idempotent baseline migration for models that exist in schema.prisma but were
-- never captured by a migration (`prisma db push` was used). Safe to run on prod
-- where these tables already exist (uses IF NOT EXISTS / DO blocks throughout).

-- ─────────────────────────── DownloadVisibility enum ──────────────────────────
DO $$ BEGIN
  CREATE TYPE "DownloadVisibility" AS ENUM ('INTERNAL', 'CLIENT', 'PUBLIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────── DownloadFile ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DownloadFile" (
  "id"                       TEXT PRIMARY KEY,
  "workspaceId"              TEXT NOT NULL,
  "category"                 TEXT NOT NULL,
  "name"                     TEXT NOT NULL,
  "description"              TEXT,
  "fileName"                 TEXT NOT NULL,
  "storedName"               TEXT NOT NULL,
  "mimeType"                 TEXT,
  "sizeBytes"                BIGINT NOT NULL,
  "visibility"               "DownloadVisibility" NOT NULL DEFAULT 'INTERNAL',
  "targetClientWorkspaceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "uploadedByUserId"         TEXT NOT NULL,
  "downloadCount"            INTEGER NOT NULL DEFAULT 0,
  "deletedAt"                TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "DownloadFile"
    ADD CONSTRAINT "DownloadFile_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DownloadFile"
    ADD CONSTRAINT "DownloadFile_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "DownloadFile_workspaceId_deletedAt_idx" ON "DownloadFile"("workspaceId", "deletedAt");
CREATE INDEX IF NOT EXISTS "DownloadFile_category_idx" ON "DownloadFile"("category");
CREATE INDEX IF NOT EXISTS "DownloadFile_targetClientWorkspaceIds_idx" ON "DownloadFile" USING GIN ("targetClientWorkspaceIds");

-- RLS for DownloadFile (workspace-scoped)
ALTER TABLE "DownloadFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DownloadFile" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "DownloadFile_tenant" ON "DownloadFile"
    FOR ALL
    USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
    WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────── OauthClient ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OauthClient" (
  "id"               TEXT PRIMARY KEY,
  "clientId"         TEXT NOT NULL,
  "clientSecretHash" TEXT NOT NULL,
  "redirectUris"     TEXT[] NOT NULL,
  "name"             TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "OauthClient_clientId_key" ON "OauthClient"("clientId");

-- ─────────────────────────── OauthAuthCode ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OauthAuthCode" (
  "code"        TEXT PRIMARY KEY,
  "clientId"    TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scope"       TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "used"        BOOLEAN NOT NULL DEFAULT false
);

DO $$ BEGIN
  ALTER TABLE "OauthAuthCode"
    ADD CONSTRAINT "OauthAuthCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "OauthAuthCode_userId_idx" ON "OauthAuthCode"("userId");
CREATE INDEX IF NOT EXISTS "OauthAuthCode_expiresAt_idx" ON "OauthAuthCode"("expiresAt");

-- ─────────────────────────── GRANTs for app roles ─────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "DownloadFile" TO infradesk_v2, infradesk_v2_bg;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OauthClient"  TO infradesk_v2, infradesk_v2_bg;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OauthAuthCode" TO infradesk_v2, infradesk_v2_bg;
GRANT USAGE ON TYPE "DownloadVisibility" TO infradesk_v2, infradesk_v2_bg;
