-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('PHONE', 'EMAIL', 'MEETING', 'QUOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('SQL_MYSQL', 'SQL_POSTGRES', 'SQL_MSSQL', 'FOLDER');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('SUCCESS', 'FAILED', 'RUNNING', 'NEVER_RAN');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('DESKTOP_AGENT', 'GPS_VISIT', 'TICKET_COMMENT', 'SSH', 'MAIL', 'PHONE', 'BROWSER');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "linkedTicketId" TEXT,
    "clientWorkspaceId" TEXT,
    "locationId" TEXT,
    "deviceId" TEXT,
    "dueAt" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "travelKm" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delegationNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "locationId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "vehicleLicensePlate" TEXT,
    "notes" TEXT,
    "status" "DelegationStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "contactId" TEXT,
    "clientWorkspaceId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpAt" TIMESTAMP(3),
    "linkedTicketId" TEXT,
    "quoteValueNet" DECIMAL(12,2),
    "quoteStatus" "QuoteStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentRegistrationId" TEXT,
    "deviceId" TEXT,
    "name" TEXT NOT NULL,
    "type" "BackupType" NOT NULL,
    "sqlHost" TEXT,
    "sqlPort" INTEGER,
    "sqlDatabase" TEXT,
    "sqlUsername" TEXT,
    "sqlPasswordEnc" TEXT,
    "sqlPasswordIv" TEXT,
    "sqlPasswordAuthTag" TEXT,
    "folderPath" TEXT,
    "googleDriveFolder" TEXT,
    "useInfradeskCloud" BOOLEAN NOT NULL DEFAULT false,
    "localBackupPath" TEXT,
    "ftpHost" TEXT,
    "ftpUsername" TEXT,
    "ftpPasswordEnc" TEXT,
    "ftpPasswordIv" TEXT,
    "ftpPasswordAuthTag" TEXT,
    "cronSchedule" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "encryptBackups" BOOLEAN NOT NULL DEFAULT true,
    "encryptionKeyEnc" TEXT,
    "encryptionKeyIv" TEXT,
    "encryptionKeyAuthTag" TEXT,
    "clientProvidedKey" BOOLEAN NOT NULL DEFAULT false,
    "lastStatus" "BackupStatus",
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupHistory" (
    "id" TEXT NOT NULL,
    "backupConfigId" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "sizeBytes" BIGINT,
    "googleDriveId" TEXT,
    "cloudPath" TEXT,
    "errorMessage" TEXT,
    "linkedTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "responseTimeMin" INTEGER NOT NULL,
    "resolveTimeMin" INTEGER NOT NULL,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requiredPlan" "Plan" NOT NULL DEFAULT 'STARTER',
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "aiGuess" JSONB NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "workSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureCluster" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "affectedClients" INTEGER NOT NULL,
    "opportunityPln" DECIMAL(10,2),
    "status" "ClusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "dismissedAt" TIMESTAMP(3),
    "dismissedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailureCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureClusterMember" (
    "clusterId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FailureClusterMember_pkey" PRIMARY KEY ("clusterId","ticketId")
);

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Task_scheduledAt_idx" ON "Task"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_workspaceId_taskNumber_key" ON "Task"("workspaceId", "taskNumber");

-- CreateIndex
CREATE INDEX "Delegation_assignedToUserId_scheduledAt_idx" ON "Delegation"("assignedToUserId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Delegation_workspaceId_status_idx" ON "Delegation"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_workspaceId_delegationNumber_key" ON "Delegation"("workspaceId", "delegationNumber");

-- CreateIndex
CREATE INDEX "CrmActivity_workspaceId_type_idx" ON "CrmActivity"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "CrmActivity_scheduledAt_idx" ON "CrmActivity"("scheduledAt");

-- CreateIndex
CREATE INDEX "CrmActivity_contactId_idx" ON "CrmActivity"("contactId");

-- CreateIndex
CREATE INDEX "BackupConfig_workspaceId_idx" ON "BackupConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "BackupConfig_nextRunAt_idx" ON "BackupConfig"("nextRunAt");

-- CreateIndex
CREATE INDEX "BackupHistory_backupConfigId_startedAt_idx" ON "BackupHistory"("backupConfigId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_workspaceId_entityType_entityId_createdAt_idx" ON "ActivityLog"("workspaceId", "entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_performedByUserId_createdAt_idx" ON "ActivityLog"("performedByUserId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_workspaceId_priority_key" ON "SlaPolicy"("workspaceId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceModule_workspaceId_moduleKey_key" ON "WorkspaceModule"("workspaceId", "moduleKey");

-- CreateIndex
CREATE INDEX "WorkspaceSetting_workspaceId_idx" ON "WorkspaceSetting"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSetting_workspaceId_key_key" ON "WorkspaceSetting"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "TimeSignal_workspaceId_userId_startedAt_idx" ON "TimeSignal"("workspaceId", "userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TimeSignal_source_startedAt_idx" ON "TimeSignal"("source", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_workSessionId_key" ON "TimeSlot"("workSessionId");

-- CreateIndex
CREATE INDEX "TimeSlot_workspaceId_userId_startedAt_idx" ON "TimeSlot"("workspaceId", "userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TimeSlot_approvedAt_idx" ON "TimeSlot"("approvedAt");

-- CreateIndex
CREATE INDEX "FailureCluster_workspaceId_status_idx" ON "FailureCluster"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FailureClusterMember_ticketId_idx" ON "FailureClusterMember"("ticketId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupConfig" ADD CONSTRAINT "BackupConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupHistory" ADD CONSTRAINT "BackupHistory_backupConfigId_fkey" FOREIGN KEY ("backupConfigId") REFERENCES "BackupConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceModule" ADD CONSTRAINT "WorkspaceModule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSetting" ADD CONSTRAINT "WorkspaceSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSignal" ADD CONSTRAINT "TimeSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSignal" ADD CONSTRAINT "TimeSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureCluster" ADD CONSTRAINT "FailureCluster_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureClusterMember" ADD CONSTRAINT "FailureClusterMember_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "FailureCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ──────────────────────────────────────────────────────────────────
-- RLS policies for new tables (pattern from 20260421010000_rls_policies)
-- ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'Task', 'Delegation', 'CrmActivity', 'BackupConfig',
    'ActivityLog', 'SlaPolicy', 'WorkspaceModule', 'WorkspaceSetting',
    'TimeSignal', 'TimeSlot', 'FailureCluster'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (app_is_super_admin() OR "workspaceId" = app_current_workspace()) WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace())',
      t || '_tenant', t
    );
  END LOOP;
END $$;

-- BackupHistory + FailureClusterMember: scoped via parent
ALTER TABLE "BackupHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackupHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BackupHistory_tenant" ON "BackupHistory" FOR ALL
  USING (app_is_super_admin() OR EXISTS (SELECT 1 FROM "BackupConfig" c WHERE c.id = "BackupHistory"."backupConfigId" AND c."workspaceId" = app_current_workspace()))
  WITH CHECK (app_is_super_admin() OR EXISTS (SELECT 1 FROM "BackupConfig" c WHERE c.id = "BackupHistory"."backupConfigId" AND c."workspaceId" = app_current_workspace()));

ALTER TABLE "FailureClusterMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FailureClusterMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FailureClusterMember_tenant" ON "FailureClusterMember" FOR ALL
  USING (app_is_super_admin() OR EXISTS (SELECT 1 FROM "FailureCluster" c WHERE c.id = "FailureClusterMember"."clusterId" AND c."workspaceId" = app_current_workspace()))
  WITH CHECK (app_is_super_admin() OR EXISTS (SELECT 1 FROM "FailureCluster" c WHERE c.id = "FailureClusterMember"."clusterId" AND c."workspaceId" = app_current_workspace()));

-- Grants for app role (if role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infradesk_v2_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Task", "Delegation", "CrmActivity", "BackupConfig", "BackupHistory", "ActivityLog", "SlaPolicy", "WorkspaceModule", "WorkspaceSetting", "TimeSignal", "TimeSlot", "FailureCluster", "FailureClusterMember" TO infradesk_v2_app';
  END IF;
END $$;
