// P1: SLA breach detection scheduler.
// Co 5min sprawdza tickety gdzie deadline minął, ustawia slaBreached=true
// + zapisuje TicketEvent('sla_breached'). Bez tego risk.service raporty są fake.

import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';

const TICK_INTERVAL_MS = 5 * 60_000; // co 5min
const FIRST_TICK_DELAY_MS = 90_000;  // 90s od startu (po deploy ważne dane uspokoją się)

let handle: NodeJS.Timeout | null = null;

export async function runSlaBreachSweep(): Promise<{ checked: number; breached: number }> {
  const now = new Date();
  // Tickety nie-rozwiązane, mające jakiekolwiek SLA, NIEoznaczone jeszcze jako breached.
  // Skanujemy jednym query (typowo 100-1000 ticketów otwartych w workspace).
  const candidates = await prismaBg.ticket.findMany({
    where: {
      slaBreached: false,
      deletedAt: null,
      status: { in: ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] },
      OR: [
        { slaResponseMinutes: { not: null } },
        { slaResolveMinutes: { not: null } },
      ],
    },
    select: {
      id: true, ticketNumber: true, createdAt: true,
      slaResponseMinutes: true, slaResolveMinutes: true,
      firstResponseAt: true, resolvedAt: true,
    },
    take: 2000,
  });
  let breached = 0;
  for (const t of candidates) {
    const created = t.createdAt.getTime();
    let isBreached = false;
    if (t.slaResponseMinutes && !t.firstResponseAt) {
      const deadline = created + t.slaResponseMinutes * 60_000;
      if (now.getTime() > deadline) isBreached = true;
    }
    if (!isBreached && t.slaResolveMinutes && !t.resolvedAt) {
      const deadline = created + t.slaResolveMinutes * 60_000;
      if (now.getTime() > deadline) isBreached = true;
    }
    if (isBreached) {
      try {
        await prismaBg.$transaction(async (tx) => {
          await tx.ticket.update({
            where: { id: t.id },
            data: { slaBreached: true },
          });
          await tx.ticketEvent.create({
            data: {
              ticketId: t.id,
              userId: null,
              eventType: 'sla_breached',
              metadata: {
                responseMin: t.slaResponseMinutes,
                resolveMin: t.slaResolveMinutes,
                detectedAt: now.toISOString(),
              },
            },
          });
        });
        breached++;
      } catch (err) {
        logger.warn({ err, ticketId: t.id }, '[sla-breach] mark failed');
      }
    }
  }
  if (breached > 0) {
    logger.info({ checked: candidates.length, breached }, '[sla-breach] sweep complete');
  }
  return { checked: candidates.length, breached };
}

export function startSlaBreachScheduler(): void {
  if (handle) return;
  logger.info('[sla-breach] scheduler started — interval 5min');
  handle = setTimeout(async function tick() {
    try {
      await runSlaBreachSweep();
    } catch (err) {
      logger.warn({ err }, '[sla-breach] sweep error');
    } finally {
      handle = setTimeout(tick, TICK_INTERVAL_MS);
    }
  }, FIRST_TICK_DELAY_MS);
}

export function stopSlaBreachScheduler(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[sla-breach] scheduler stopped');
  }
}
