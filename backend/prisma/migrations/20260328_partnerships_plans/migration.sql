-- Add PartnerRole enum
CREATE TYPE "PartnerRole" AS ENUM ('VIEWER', 'REMOTE_SUPPORT', 'FULL_MANAGEMENT');

-- Add maxClients to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "maxClients" INTEGER NOT NULL DEFAULT 5;

-- Create TenantPartnership
CREATE TABLE "TenantPartnership" (
    "id" TEXT NOT NULL,
    "ownerTenantId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "role" "PartnerRole" NOT NULL DEFAULT 'REMOTE_SUPPORT',
    "name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantPartnership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantPartnership_ownerTenantId_partnerTenantId_key" ON "TenantPartnership"("ownerTenantId", "partnerTenantId");
CREATE INDEX "TenantPartnership_ownerTenantId_idx" ON "TenantPartnership"("ownerTenantId");
CREATE INDEX "TenantPartnership_partnerTenantId_idx" ON "TenantPartnership"("partnerTenantId");
ALTER TABLE "TenantPartnership" ADD CONSTRAINT "TenantPartnership_ownerTenantId_fkey" FOREIGN KEY ("ownerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPartnership" ADD CONSTRAINT "TenantPartnership_partnerTenantId_fkey" FOREIGN KEY ("partnerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create SharedDevice
CREATE TABLE "SharedDevice" (
    "id" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "SharedDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedDevice_partnershipId_deviceId_key" ON "SharedDevice"("partnershipId", "deviceId");
CREATE INDEX "SharedDevice_partnershipId_idx" ON "SharedDevice"("partnershipId");
CREATE INDEX "SharedDevice_deviceId_idx" ON "SharedDevice"("deviceId");
ALTER TABLE "SharedDevice" ADD CONSTRAINT "SharedDevice_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "TenantPartnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedDevice" ADD CONSTRAINT "SharedDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create GuestAccess
CREATE TABLE "GuestAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "label" TEXT NOT NULL,
    "role" "PartnerRole" NOT NULL DEFAULT 'VIEWER',
    "deviceIds" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestAccess_token_key" ON "GuestAccess"("token");
ALTER TABLE "GuestAccess" ADD CONSTRAINT "GuestAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add partnershipId to Ticket
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "partnershipId" TEXT;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "TenantPartnership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update SILERS tenant to ENTERPRISE with no limits
UPDATE "Tenant" SET "maxClients" = 999, "maxAgents" = 999, "maxUsers" = 999 WHERE slug = 'silers';
