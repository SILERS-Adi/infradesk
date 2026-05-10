-- AlterTable
ALTER TABLE "CrmActivity" ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "linkedTicketId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "clientWorkspaceId" TEXT,
ADD COLUMN     "hasCrm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasOrder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasService" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "CrmActivity_linkedTicketId_idx" ON "CrmActivity"("linkedTicketId");

-- CreateIndex
CREATE INDEX "Order_linkedTicketId_idx" ON "Order"("linkedTicketId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

