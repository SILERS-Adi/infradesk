-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "withInstallation" BOOLEAN NOT NULL DEFAULT false;

