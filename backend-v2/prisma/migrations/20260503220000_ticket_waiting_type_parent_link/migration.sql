-- F2.3: WAITING distinction CLIENT/SUPPLIER/INTERNAL
CREATE TYPE "WaitingType" AS ENUM ('CLIENT', 'SUPPLIER', 'INTERNAL');

ALTER TABLE "Ticket" ADD COLUMN "waitingType" "WaitingType";
ALTER TABLE "Ticket" ADD COLUMN "waitingFor" TEXT;

-- F8.2: duplicate-link parent-child
ALTER TABLE "Ticket" ADD COLUMN "parentTicketId" TEXT;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_parentTicketId_fkey"
  FOREIGN KEY ("parentTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL;
CREATE INDEX "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");

-- RLS — waitingType, waitingFor, parentTicketId są częścią Ticket → istniejące RLS policies obejmują
