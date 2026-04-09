/**
 * SLA Breach Checker — runs periodically to mark breached tickets and send alerts.
 */
import prisma from '../lib/prisma';

export async function checkSlaBreaches(): Promise<{ marked: number; alerts: number }> {
  const now = new Date();

  // Find tickets that are overdue but not yet marked as breached
  const overdue = await prisma.ticket.findMany({
    where: {
      status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'] },
      dueAt: { not: null, lt: now },
      slaBreached: false,
      deletedAt: null,
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      workspaceId: true,
      assignedToUserId: true,
      priority: true,
    },
    take: 100, // Process in batches
  });

  if (overdue.length === 0) return { marked: 0, alerts: 0 };

  // Mark as breached
  await prisma.ticket.updateMany({
    where: { id: { in: overdue.map(t => t.id) } },
    data: { slaBreached: true },
  });

  // Create notifications for assigned technicians
  let alerts = 0;
  for (const ticket of overdue) {
    if (ticket.assignedToUserId) {
      try {
        await prisma.notification.create({
          data: {
            userId: ticket.assignedToUserId,
            workspaceId: ticket.workspaceId,
            title: `SLA przekroczone: ${ticket.ticketNumber}`,
            message: `Zgłoszenie "${ticket.title}" (${ticket.priority}) przekroczyło czas SLA.`,
          },
        });
        alerts++;
      } catch { /* notification creation may fail if FK missing — silent */ }
    }
  }

  if (overdue.length > 0) {
    console.log(`[SLA] Marked ${overdue.length} tickets as breached, sent ${alerts} alerts`);
  }

  return { marked: overdue.length, alerts };
}
