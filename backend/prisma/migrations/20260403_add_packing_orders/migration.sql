CREATE TYPE "PackingOrderStatus" AS ENUM ('NEW', 'PAID', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');

CREATE TABLE "PackingOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "status" "PackingOrderStatus" NOT NULL DEFAULT 'NEW',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "buyerNote" TEXT,
    "internalNote" TEXT,
    "addressName" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressZip" TEXT,
    "addressPhone" TEXT,
    "deliveryMethod" TEXT,
    "deliveryPointId" TEXT,
    "courierName" TEXT,
    "trackingNumber" TEXT,
    "dispatchDeadline" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackingOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackingOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    CONSTRAINT "PackingOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackingOrder_workspaceId_status_idx" ON "PackingOrder"("workspaceId", "status");
CREATE INDEX "PackingOrder_workspaceId_createdAt_idx" ON "PackingOrder"("workspaceId", "createdAt");
CREATE INDEX "PackingOrderItem_orderId_idx" ON "PackingOrderItem"("orderId");

ALTER TABLE "PackingOrderItem" ADD CONSTRAINT "PackingOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "PackingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
