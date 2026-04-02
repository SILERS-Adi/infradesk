CREATE TABLE "InvoicingPayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'przelew',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoicingPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoicingPayment_workspaceId_idx" ON "InvoicingPayment"("workspaceId");
CREATE INDEX "InvoicingPayment_documentId_idx" ON "InvoicingPayment"("documentId");

ALTER TABLE "InvoicingPayment" ADD CONSTRAINT "InvoicingPayment_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
