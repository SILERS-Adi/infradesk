-- Per-user reusable PIN for protected public downloads (e.g. RustDesk).
ALTER TABLE "User" ADD COLUMN "personalDownloadPin" TEXT;

CREATE UNIQUE INDEX "User_personalDownloadPin_key" ON "User"("personalDownloadPin");
