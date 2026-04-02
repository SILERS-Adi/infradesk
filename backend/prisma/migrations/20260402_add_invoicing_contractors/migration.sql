CREATE TABLE "InvoicingContractor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoicingContractor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoicingContractor_workspaceId_idx" ON "InvoicingContractor"("workspaceId");
CREATE INDEX "InvoicingContractor_workspaceId_name_idx" ON "InvoicingContractor"("workspaceId", "name");
