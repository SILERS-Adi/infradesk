// F2.4: Auto-close RESOLVED tickets after 7 days bez aktywności klienta.
// Działa co 6h. Przekształca RESOLVED w CLOSED + zapisuje TicketEvent('auto_closed').

import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';

const TICK_INTERVAL_MS = 6 * 60 * 60_000; // co 6h
const FIRST_TICK_DELAY_MS = 5 * 60_000;   // 5min po starcie
const AUTO_CLOSE_AFTER_DAYS = 7;

let handle: NodeJS.Timeout | null = null;

export async function runTicketAutoCloseSweep(): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_AFTER_DAYS * 24 * 60 * 60_000);
  const candidates = await prismaBg.ticket.findMany({
    where: {
      status: 'RESOLVED',
      resolvedAt: { lt: cutoff },
      deletedAt: null,
    },
    select: { id: true, ticketNumber: true, workspaceId: true },
    take: 200, // safety
  });
  if (candidates.length === 0) return { closed: 0 };

  let closed = 0;
  for (const t of candidates) {
    try {
      await prismaBg.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: t.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: t.id,
            userId: null,
            eventType: 'auto_closed',
            fromValue: 'RESOLVED',
            toValue: 'CLOSED',
            metadata: { reason: `auto_close_after_${AUTO_CLOSE_AFTER_DAYS}_days` },
          },
        });
      });
      closed++;
    } catch (err) {
      logger.warn({ err, ticketId: t.id }, '[ticket-auto-close] failed for ticket');
    }
  }
  logger.info({ closed, found: candidates.length }, '[ticket-auto-close] sweep complete');
  return { closed };
}

export function startTicketAutoCloseScheduler(): void {
  if (handle) return;
  logger.info('[ticket-auto-close] scheduler started — interval 6h, threshold 7d');
  handle = setTimeout(async function tick() {
    try {
      await runTicketAutoCloseSweep();
    } catch (err) {
      logger.warn({ err }, '[ticket-auto-close] sweep error');
    } finally {
      handle = setTimeout(tick, TICK_INTERVAL_MS);
    }
  }, FIRST_TICK_DELAY_MS);
}

export function stopTicketAutoCloseScheduler(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[ticket-auto-close] scheduler stopped');
  }
}
