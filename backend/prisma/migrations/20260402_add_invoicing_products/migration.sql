CREATE TABLE "InvoicingProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'szt',
    "priceNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatRate" TEXT NOT NULL DEFAULT '23',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoicingProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoicingProduct_workspaceId_idx" ON "InvoicingProduct"("workspaceId");
CREATE INDEX "InvoicingProduct_workspaceId_name_idx" ON "InvoicingProduct"("workspaceId", "name");
