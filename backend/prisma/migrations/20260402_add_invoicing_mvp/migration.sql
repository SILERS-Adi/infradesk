-- CreateEnum
CREATE TYPE "InvoiceDocumentType" AS ENUM ('SALE_INVOICE', 'CORRECTION', 'PROFORMA', 'ADVANCE', 'FINAL', 'RECEIPT', 'PURCHASE_INVOICE');

-- CreateEnum
CREATE TYPE "InvoiceDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "InvoiceDocumentType" NOT NULL DEFAULT 'SALE_INVOICE',
    "status" "InvoiceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "contractorName" TEXT NOT NULL,
    "contractorNip" TEXT,
    "totalNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "priceNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatRate" TEXT NOT NULL DEFAULT '23',
    "totalNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDocument_workspaceId_status_idx" ON "InvoiceDocument"("workspaceId", "status");
CREATE INDEX "InvoiceDocument_workspaceId_issuedAt_idx" ON "InvoiceDocument"("workspaceId", "issuedAt");
CREATE INDEX "InvoiceDocument_workspaceId_type_idx" ON "InvoiceDocument"("workspaceId", "type");
CREATE INDEX "InvoiceDocumentItem_documentId_idx" ON "InvoiceDocumentItem"("documentId");

-- AddForeignKey
ALTER TABLE "InvoiceDocumentItem" ADD CONSTRAINT "InvoiceDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
