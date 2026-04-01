-- Fix: add missing TenantType enum and columns to Tenant table

-- Create TenantType enum if not exists
DO $$ BEGIN
  CREATE TYPE "TenantType" AS ENUM ('PERSONAL', 'BUSINESS', 'MSP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create PartnershipStatus enum if not exists
DO $$ BEGIN
  CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add missing columns to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "tenantType" "TenantType" NOT NULL DEFAULT 'BUSINESS';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "parentTenantId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "defaultPartnerId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "enabledModules" JSONB;

-- Add self-reference FK for parent tenant (MSP hierarchy)
DO $$ BEGIN
  ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_parentTenantId_fkey"
    FOREIGN KEY ("parentTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
