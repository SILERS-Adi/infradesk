CREATE TYPE "ServiceInspectionType" AS ENUM ('PERIODIC', 'TECHNICAL', 'GAS_INSTALLATION', 'ADR', 'TAXI', 'OTHER');
CREATE TYPE "ServiceInspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ServiceInspectionResult" AS ENUM ('POSITIVE', 'NEGATIVE', 'CONDITIONAL');

CREATE TABLE "ServiceVehicle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "vin" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceInspection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "type" "ServiceInspectionType" NOT NULL DEFAULT 'PERIODIC',
    "status" "ServiceInspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "result" "ServiceInspectionResult",
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "technicianName" TEXT,
    "notes" TEXT,
    "mileage" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceInspection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceVehicle_workspaceId_idx" ON "ServiceVehicle"("workspaceId");
CREATE INDEX "ServiceVehicle_workspaceId_plate_idx" ON "ServiceVehicle"("workspaceId", "plate");
CREATE INDEX "ServiceInspection_workspaceId_status_idx" ON "ServiceInspection"("workspaceId", "status");
CREATE INDEX "ServiceInspection_workspaceId_scheduledAt_idx" ON "ServiceInspection"("workspaceId", "scheduledAt");
CREATE INDEX "ServiceInspection_vehicleId_idx" ON "ServiceInspection"("vehicleId");

ALTER TABLE "ServiceInspection" ADD CONSTRAINT "ServiceInspection_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "ServiceVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
