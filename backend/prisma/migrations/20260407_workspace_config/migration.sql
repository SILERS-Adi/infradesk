-- CreateEnum: OrganizationType
CREATE TYPE "OrganizationType" AS ENUM ('CLIENT', 'INTERNAL_IT', 'MSP');

-- CreateEnum: ModuleKey
CREATE TYPE "ModuleKey" AS ENUM ('INFRASTRUCTURE', 'SERVICE_DESK', 'INVOICING', 'PACKAGING', 'SKP', 'AI');

-- CreateEnum: ModuleState
CREATE TYPE "ModuleState" AS ENUM ('ACTIVE', 'TRIAL', 'INACTIVE', 'LIMITED', 'READONLY', 'MANAGED_BY_PROVIDER', 'EXPIRED');

-- CreateEnum: PlatformBillingMode
CREATE TYPE "PlatformBillingMode" AS ENUM ('SELF', 'PROVIDER');

-- CreateEnum: AccountManagedBy
CREATE TYPE "AccountManagedBy" AS ENUM ('SELF', 'PROVIDER');

-- CreateEnum: DetachPolicy
CREATE TYPE "DetachPolicy" AS ENUM ('ALLOWED', 'APPROVAL_REQUIRED', 'BLOCKED');

-- AlterTable: Add canonical config fields to Workspace
ALTER TABLE "Workspace" ADD COLUMN "orgType" "OrganizationType" NOT NULL DEFAULT 'INTERNAL_IT';
ALTER TABLE "Workspace" ADD COLUMN "platformBillingMode" "PlatformBillingMode" NOT NULL DEFAULT 'SELF';
ALTER TABLE "Workspace" ADD COLUMN "accountManagedBy" "AccountManagedBy" NOT NULL DEFAULT 'SELF';
ALTER TABLE "Workspace" ADD COLUMN "detachPolicy" "DetachPolicy" NOT NULL DEFAULT 'ALLOWED';

-- CreateTable: WorkspaceModule
CREATE TABLE "WorkspaceModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" "ModuleKey" NOT NULL,
    "state" "ModuleState" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceModule_workspaceId_idx" ON "WorkspaceModule"("workspaceId");

-- CreateIndex (unique constraint)
CREATE UNIQUE INDEX "WorkspaceModule_workspaceId_moduleKey_key" ON "WorkspaceModule"("workspaceId", "moduleKey");

-- AddForeignKey
ALTER TABLE "WorkspaceModule" ADD CONSTRAINT "WorkspaceModule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill orgType from legacy organizationType string
UPDATE "Workspace" SET "orgType" = 'MSP' WHERE "organizationType" IN ('msp', 'it_operator');
UPDATE "Workspace" SET "orgType" = 'CLIENT' WHERE "organizationType" IN ('client', 'client_external_it');
UPDATE "Workspace" SET "orgType" = 'INTERNAL_IT' WHERE "organizationType" NOT IN ('msp', 'it_operator', 'client', 'client_external_it');
