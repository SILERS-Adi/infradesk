-- Add backup destination fields
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "googleDriveRefreshToken" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "googleDriveEmail" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "localBackupPath" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "ftpHost" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "ftpPort" INTEGER;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "ftpUser" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "ftpPassEnc" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "ftpPath" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT;

-- Add Google API credentials to PlatformConfig
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "googleClientId" TEXT;
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "googleClientSecret" TEXT;
