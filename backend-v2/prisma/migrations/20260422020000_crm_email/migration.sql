-- CreateEnum
CREATE TYPE "EmailAccountType" AS ENUM ('PERSONAL', 'SHARED', 'MSP_MAIN');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('IMAP', 'GMAIL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EmailFolder" AS ENUM ('INBOX', 'SENT', 'ARCHIVE', 'SPAM', 'DRAFT');

-- CreateTable
CREATE TABLE "UserEmailAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "type" "EmailAccountType" NOT NULL DEFAULT 'PERSONAL',
    "provider" "EmailProvider" NOT NULL DEFAULT 'IMAP',
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapUsername" TEXT,
    "imapPasswordEnc" TEXT,
    "imapPasswordIv" TEXT,
    "imapPasswordAuthTag" TEXT,
    "imapUseTls" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsername" TEXT,
    "smtpPasswordEnc" TEXT,
    "smtpPasswordIv" TEXT,
    "smtpPasswordAuthTag" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMsg" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageId" TEXT,
    "threadId" TEXT,
    "direction" "EmailDirection" NOT NULL DEFAULT 'INBOUND',
    "folder" "EmailFolder" NOT NULL DEFAULT 'INBOX',
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "linkedTicketId" TEXT,
    "linkedCrmActivityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "addedManually" BOOLEAN NOT NULL DEFAULT true,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEmailAccount_workspaceId_userId_idx" ON "UserEmailAccount"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "UserEmailAccount_workspaceId_type_idx" ON "UserEmailAccount"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmailAccount_userId_email_key" ON "UserEmailAccount"("userId", "email");

-- CreateIndex
CREATE INDEX "EmailMessage_accountId_receivedAt_idx" ON "EmailMessage"("accountId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "EmailMessage_workspaceId_linkedTicketId_idx" ON "EmailMessage"("workspaceId", "linkedTicketId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- AddForeignKey
ALTER TABLE "UserEmailAccount" ADD CONSTRAINT "UserEmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmailAccount" ADD CONSTRAINT "UserEmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserEmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

