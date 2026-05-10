-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('MSP', 'CLIENT', 'INTERNAL_IT');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "RelationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('HOURLY', 'SUBSCRIPTION', 'HYBRID');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('FULL', 'SCOPED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DEVICE', 'LOCATION', 'CLIENT_WORKSPACE');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'VIEW', 'EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('EMAIL', 'PORTAL', 'AGENT', 'PHONE', 'AI_CHAT', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('REMOTE', 'ONSITE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CredentialCategory" AS ENUM ('WINDOWS', 'VPN', 'EMAIL', 'APPLICATION', 'DATABASE', 'ROUTER', 'WIFI', 'SSH', 'API_KEY', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'QUOTE_SENT', 'APPROVED', 'ORDERED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('VAT', 'PROFORMA', 'CORRECTION', 'ADVANCE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KbStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'NETWORK', 'MANUAL', 'QR_SCAN');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('AUTO_GEOFENCE', 'MANUAL', 'QR_SCAN', 'PHONE_TAP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'pl-PL',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifySentAt" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "deletedAt" TIMESTAMP(3),
    "dataExportedAt" TIMESTAMP(3),
    "erasureRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "taxId" TEXT,
    "regon" TEXT,
    "krs" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "locale" TEXT NOT NULL DEFAULT 'pl-PL',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "planStartedAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionId" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PL',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceRelation" (
    "id" TEXT NOT NULL,
    "providerWorkspaceId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT NOT NULL,
    "status" "RelationStatus" NOT NULL DEFAULT 'ACTIVE',
    "canViewDevices" BOOLEAN NOT NULL DEFAULT true,
    "canViewUsers" BOOLEAN NOT NULL DEFAULT true,
    "canViewLocations" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveTickets" BOOLEAN NOT NULL DEFAULT true,
    "canCreateTicketsOnBehalf" BOOLEAN NOT NULL DEFAULT true,
    "canAccessAlerts" BOOLEAN NOT NULL DEFAULT true,
    "canAccessCredentials" BOOLEAN NOT NULL DEFAULT false,
    "billingType" "BillingType" NOT NULL DEFAULT 'HOURLY',
    "monthlyNet" DECIMAL(10,2),
    "monthlyHours" INTEGER,
    "overageRateNet" DECIMAL(10,2),
    "hourlyRateNet" DECIMAL(10,2),
    "billingIncrementMin" INTEGER NOT NULL DEFAULT 15,
    "contractFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scope" "Scope" NOT NULL DEFAULT 'FULL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "level" "AccessLevel" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionOverride" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "level" "AccessLevel" NOT NULL,

    CONSTRAINT "PermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'OFFICE',
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'PL',
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLon" DOUBLE PRECISION,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "autoCheckInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requireQrConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "category" "DeviceCategory" NOT NULL,
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "assetTag" TEXT,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "qrCodeValue" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "managerId" TEXT,
    "rustdeskId" TEXT,
    "rdpAddress" TEXT,
    "sshAddress" TEXT,
    "anydeskId" TEXT,
    "teamviewerId" TEXT,
    "customRemoteLink" TEXT,
    "description" TEXT,
    "internalNotes" TEXT,
    "clientVisibleNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRegistration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "agentToken" TEXT NOT NULL,
    "agentTokenHash" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL DEFAULT 'unknown',
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "hostname" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "cpuModel" TEXT,
    "ramMb" INTEGER,
    "diskFreeGb" DOUBLE PRECISION,
    "diskTotalGb" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "serverMetrics" JSONB,
    "currentUser" TEXT,
    "companyName" TEXT,
    "nip" TEXT,
    "contactFirstName" TEXT,
    "contactLastName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "allowRustdesk" BOOLEAN NOT NULL DEFAULT true,
    "allowMonitoring" BOOLEAN NOT NULL DEFAULT true,
    "allowRemoteCommands" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "category" TEXT,
    "type" "TicketType" NOT NULL DEFAULT 'INCIDENT',
    "source" "TicketSource" NOT NULL,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "requesterPhone" TEXT,
    "deviceId" TEXT,
    "locationId" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "slaResponseMinutes" INTEGER,
    "slaResolveMinutes" INTEGER,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "aiClassified" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "aiSuggestedAction" TEXT,
    "resolutionSummary" TEXT,
    "serviceMode" "ServiceMode",
    "billedInContract" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "deviceId" TEXT,
    "locationId" TEXT,
    "clientWorkspaceId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "serviceMode" "ServiceMode" DEFAULT 'REMOTE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "billableMinutes" INTEGER,
    "notes" TEXT,
    "aiSummary" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRateNet" DECIMAL(10,2),
    "externalSourceType" TEXT,
    "externalSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoStartedByGeofence" BOOLEAN NOT NULL DEFAULT false,
    "arrivalGpsLat" DOUBLE PRECISION,
    "arrivalGpsLon" DOUBLE PRECISION,
    "arrivalAccuracy" DOUBLE PRECISION,
    "departureGpsLat" DOUBLE PRECISION,
    "departureGpsLon" DOUBLE PRECISION,
    "distanceTraveledKm" DOUBLE PRECISION,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTimeEntry" (
    "id" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,

    CONSTRAINT "SessionTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSessionLink" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSessionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "autoResolveReason" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "locationId" TEXT,
    "category" "CredentialCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "passwordEncrypted" TEXT NOT NULL,
    "passwordIv" TEXT NOT NULL,
    "passwordAuthTag" TEXT NOT NULL,
    "urlOrHost" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastRotatedAt" TIMESTAMP(3),
    "rotationPolicyDays" INTEGER,
    "visibleToRoles" "Role"[] DEFAULT ARRAY['OWNER', 'ADMIN']::"Role"[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialViewLog" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,

    CONSTRAINT "CredentialViewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "position" TEXT,
    "isMainContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientWorkspaceId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 23,
    "supplierName" TEXT,
    "supplierOrderRef" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitNet" DECIMAL(10,2) NOT NULL,
    "totalNet" DECIMAL(12,2) NOT NULL,
    "linkedDeviceId" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'VAT',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sellerName" TEXT NOT NULL,
    "sellerTaxId" TEXT,
    "sellerAddress" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT,
    "buyerAddress" TEXT NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "vatTotal" DECIMAL(12,2) NOT NULL,
    "grossTotal" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(12,2),
    "ksefSubmittedAt" TIMESTAMP(3),
    "ksefReferenceNumber" TEXT,
    "ksefStatus" TEXT,
    "ksefXml" TEXT,
    "pdfStorageKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unitNet" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "vatTotal" DECIMAL(12,2) NOT NULL,
    "grossTotal" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'szt.',

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costPln" DECIMAL(10,4) NOT NULL,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbArticle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'AI_GENERATED',
    "sourceTicketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "KbStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "publishedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VectorEmbedding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VectorEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapUser" TEXT NOT NULL,
    "imapPasswordEncrypted" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "ticketId" TEXT,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianLocationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "source" "LocationSource" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "deviceBattery" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianLocationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationVisit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "checkInMethod" "CheckInMethod" NOT NULL,
    "workSessionId" TEXT,
    "distanceFromPreviousKm" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianGpsConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenAt" TIMESTAMP(3),
    "consentRevokedAt" TIMESTAMP(3),
    "gpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backgroundTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "proximityAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "workingHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '17:00',
    "trackingOnWeekends" BOOLEAN NOT NULL DEFAULT false,
    "offDutyActivatedAt" TIMESTAMP(3),
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "batteryThresholdPercent" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianGpsConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isSuperAdmin_idx" ON "User"("isSuperAdmin");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_type_idx" ON "Workspace"("type");

-- CreateIndex
CREATE INDEX "Workspace_plan_idx" ON "Workspace"("plan");

-- CreateIndex
CREATE INDEX "WorkspaceRelation_providerWorkspaceId_idx" ON "WorkspaceRelation"("providerWorkspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceRelation_clientWorkspaceId_idx" ON "WorkspaceRelation"("clientWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRelation_providerWorkspaceId_clientWorkspaceId_key" ON "WorkspaceRelation"("providerWorkspaceId", "clientWorkspaceId");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "AccessGrant_resourceType_resourceId_idx" ON "AccessGrant"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_membershipId_resourceType_resourceId_key" ON "AccessGrant"("membershipId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionOverride_membershipId_moduleKey_key" ON "PermissionOverride"("membershipId", "moduleKey");

-- CreateIndex
CREATE INDEX "Location_workspaceId_idx" ON "Location"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_qrCodeValue_key" ON "Device"("qrCodeValue");

-- CreateIndex
CREATE INDEX "Device_workspaceId_status_idx" ON "Device"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_workspaceId_name_key" ON "Device"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistration_deviceId_key" ON "AgentRegistration"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistration_agentToken_key" ON "AgentRegistration"("agentToken");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistration_agentTokenHash_key" ON "AgentRegistration"("agentTokenHash");

-- CreateIndex
CREATE INDEX "AgentRegistration_workspaceId_status_idx" ON "AgentRegistration"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AgentRegistration_lastSeen_idx" ON "AgentRegistration"("lastSeen");

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_status_idx" ON "Ticket"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Ticket_assignedToUserId_idx" ON "Ticket"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Ticket_deviceId_idx" ON "Ticket"("deviceId");

-- CreateIndex
CREATE INDEX "Ticket_priority_status_idx" ON "Ticket"("priority", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_workspaceId_ticketNumber_key" ON "Ticket"("workspaceId", "ticketNumber");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkSession_workspaceId_technicianId_idx" ON "WorkSession"("workspaceId", "technicianId");

-- CreateIndex
CREATE INDEX "WorkSession_status_idx" ON "WorkSession"("status");

-- CreateIndex
CREATE INDEX "WorkSession_startedAt_idx" ON "WorkSession"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSessionLink_ticketId_workSessionId_key" ON "TicketSessionLink"("ticketId", "workSessionId");

-- CreateIndex
CREATE INDEX "MonitoringAlert_workspaceId_resolved_idx" ON "MonitoringAlert"("workspaceId", "resolved");

-- CreateIndex
CREATE INDEX "MonitoringAlert_deviceId_type_idx" ON "MonitoringAlert"("deviceId", "type");

-- CreateIndex
CREATE INDEX "MonitoringAlert_severity_resolved_idx" ON "MonitoringAlert"("severity", "resolved");

-- CreateIndex
CREATE INDEX "Credential_workspaceId_idx" ON "Credential"("workspaceId");

-- CreateIndex
CREATE INDEX "Credential_deviceId_idx" ON "Credential"("deviceId");

-- CreateIndex
CREATE INDEX "CredentialViewLog_credentialId_viewedAt_idx" ON "CredentialViewLog"("credentialId", "viewedAt");

-- CreateIndex
CREATE INDEX "CredentialViewLog_userId_idx" ON "CredentialViewLog"("userId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");

-- CreateIndex
CREATE INDEX "Contact_clientWorkspaceId_idx" ON "Contact"("clientWorkspaceId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_idx" ON "Order"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_workspaceId_orderNumber_key" ON "Order"("workspaceId", "orderNumber");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_status_idx" ON "Invoice"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_workspaceId_invoiceNumber_key" ON "Invoice"("workspaceId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LlmUsage_workspaceId_createdAt_idx" ON "LlmUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsage_feature_idx" ON "LlmUsage"("feature");

-- CreateIndex
CREATE INDEX "KbArticle_workspaceId_status_idx" ON "KbArticle"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "VectorEmbedding_workspaceId_entityType_idx" ON "VectorEmbedding"("workspaceId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "VectorEmbedding_workspaceId_entityType_entityId_key" ON "VectorEmbedding"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConfig_emailAddress_key" ON "MailboxConfig"("emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_messageId_key" ON "InboundMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubscription_endpoint_key" ON "NotificationSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "TechnicianLocationLog_technicianId_recordedAt_idx" ON "TechnicianLocationLog"("technicianId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "TechnicianLocationLog_workspaceId_recordedAt_idx" ON "TechnicianLocationLog"("workspaceId", "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LocationVisit_workSessionId_key" ON "LocationVisit"("workSessionId");

-- CreateIndex
CREATE INDEX "LocationVisit_locationId_checkedInAt_idx" ON "LocationVisit"("locationId", "checkedInAt");

-- CreateIndex
CREATE INDEX "LocationVisit_technicianId_checkedInAt_idx" ON "LocationVisit"("technicianId", "checkedInAt");

-- CreateIndex
CREATE INDEX "LocationVisit_workspaceId_checkedInAt_idx" ON "LocationVisit"("workspaceId", "checkedInAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianGpsConsent_userId_key" ON "TechnicianGpsConsent"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_providerWorkspaceId_fkey" FOREIGN KEY ("providerWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRelation" ADD CONSTRAINT "WorkspaceRelation_clientWorkspaceId_fkey" FOREIGN KEY ("clientWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionOverride" ADD CONSTRAINT "PermissionOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimeEntry" ADD CONSTRAINT "SessionTimeEntry_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSessionLink" ADD CONSTRAINT "TicketSessionLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSessionLink" ADD CONSTRAINT "TicketSessionLink_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialViewLog" ADD CONSTRAINT "CredentialViewLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialViewLog" ADD CONSTRAINT "CredentialViewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbArticle" ADD CONSTRAINT "KbArticle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailboxConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianLocationLog" ADD CONSTRAINT "TechnicianLocationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianLocationLog" ADD CONSTRAINT "TechnicianLocationLog_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationVisit" ADD CONSTRAINT "LocationVisit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationVisit" ADD CONSTRAINT "LocationVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationVisit" ADD CONSTRAINT "LocationVisit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationVisit" ADD CONSTRAINT "LocationVisit_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianGpsConsent" ADD CONSTRAINT "TechnicianGpsConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianGpsConsent" ADD CONSTRAINT "TechnicianGpsConsent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

