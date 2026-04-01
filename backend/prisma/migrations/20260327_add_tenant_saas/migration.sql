-- CreateEnums
CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE "TenantType" AS ENUM ('PERSONAL', 'BUSINESS', 'MSP');
CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

-- CreateTable: Tenant
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "tenantKey" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantType" "TenantType" NOT NULL DEFAULT 'BUSINESS',
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',
    "parentTenantId" TEXT,
    "defaultPartnerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#6D28D9',
    "maxAgents" INTEGER NOT NULL DEFAULT 10,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "ownerEmail" TEXT NOT NULL,
    "enabledModules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");
CREATE UNIQUE INDEX "Tenant_tenantKey_key" ON "Tenant"("tenantKey");

-- Add tenantId columns to all tables
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Client" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Location" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DeviceType" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Device" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AccessType" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Credential" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CrmActivity" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "WorkSession" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AgentRegistration" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "BackupConfig" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Task" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Order" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Delegation" ADD COLUMN "tenantId" TEXT;

-- Migrate Setting from key-based PK to id-based PK with tenant scope
-- Step 1: Create new Setting table
CREATE TABLE "Setting_new" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_new_pkey" PRIMARY KEY ("id")
);
-- Step 2: Copy data
INSERT INTO "Setting_new" ("id", "key", "value", "updatedAt")
SELECT gen_random_uuid()::text, "key", "value", "updatedAt" FROM "Setting";
-- Step 3: Drop old, rename new
DROP TABLE "Setting";
ALTER TABLE "Setting_new" RENAME TO "Setting";
CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "Setting"("tenantId", "key");

-- Migrate AppSetting from key-based PK to id-based PK with tenant scope
CREATE TABLE "AppSetting_new" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_new_pkey" PRIMARY KEY ("id")
);
INSERT INTO "AppSetting_new" ("id", "key", "value", "updatedAt")
SELECT gen_random_uuid()::text, "key", "value", "updatedAt" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "AppSetting_new" RENAME TO "AppSetting";
CREATE UNIQUE INDEX "AppSetting_tenantId_key_key" ON "AppSetting"("tenantId", "key");

-- Add foreign keys for tenantId
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceType" ADD CONSTRAINT "DeviceType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessType" ADD CONSTRAINT "AccessType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackupConfig" ADD CONSTRAINT "BackupConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Self-reference for parent tenant (MSP → child)
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
