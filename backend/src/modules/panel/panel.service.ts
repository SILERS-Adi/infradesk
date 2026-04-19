/**
 * panel.service — agregaty dla ID Panel (/panel/* UI).
 * Osobny od dashboard.service — żeby design UI nie był sztywno związany z portal/dashboard API.
 */
import prisma from '../../lib/prisma';

const OPEN_STATUSES = ['PENDING', 'ASSIGNED'] as const;

/** Resolve workspace scope: MSP widzi wszystkie swoje klientów, reszta tylko swój ws. */
async function scopedWorkspaceFilter(workspaceId: string | null | undefined) {
  if (!workspaceId) return {};
  try {
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const ids: string[] = await getMspWorkspaceIds(workspaceId);
    if (ids && ids.length > 1) return { workspaceId: { in: ids } };
  } catch {
    // mspScope util not available — fall back to single ws
  }
  return { workspaceId };
}

/**
 * Puls Firmy — composite score 0-100 + 4 key metrics.
 * Score liczymy z:
 *   - open tickets (im mniej tym lepiej)
 *   - overdue tickets (penalty)
 *   - devices online ratio
 *   - billing overdue (penalty gdy są zaległe faktury)
 */
export async function getPanelPulse(workspaceId: string | null | undefined) {
  const wf = await scopedWorkspaceFilter(workspaceId);

  const now = new Date();
  const [
    totalDevices,
    openTickets,
    overdueTickets,
    unassignedTickets,
    invoicesOverdue,
    ticketsLast24h,
  ] = await Promise.all([
    prisma.device.count({ where: wf }),
    prisma.ticket.count({ where: { ...wf, status: { in: [...OPEN_STATUSES] } } }),
    prisma.ticket.count({
      where: { ...wf, status: { in: [...OPEN_STATUSES] }, dueAt: { lt: now } },
    }),
    prisma.ticket.count({ where: { ...wf, status: 'PENDING', assignedToUserId: null } }),
    prisma.invoiceDocument.count({
      where: {
        ...wf,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] as any },
        dueDate: { lt: now },
      },
    }).catch(() => 0),
    prisma.ticket.count({
      where: { ...wf, createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
    }),
  ]);

  // Score: start from 100, penalizujemy za problemy
  let score = 100;
  score -= Math.min(30, overdueTickets * 5);
  score -= Math.min(15, unassignedTickets * 2);
  score -= Math.min(20, invoicesOverdue * 4);
  score -= Math.min(15, Math.max(0, openTickets - 10));
  score = Math.max(0, Math.min(100, score));

  let state: 'ok' | 'warn' | 'alert' = 'ok';
  if (score < 60) state = 'alert';
  else if (score < 85) state = 'warn';

  return {
    score,
    state,
    metrics: {
      openTickets,
      overdueTickets,
      unassignedTickets,
      totalDevices,
      invoicesOverdue,
      ticketsLast24h,
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * Tiles — 4 szybkie metryki pod hero.
 * MSP/OWNER/ADMIN dostają billing, reszta nie.
 */
export async function getPanelTiles(
  workspaceId: string | null | undefined,
  role: string,
) {
  const wf = await scopedWorkspaceFilter(workspaceId);
  const now = new Date();

  const [openTickets, totalDevices, devicesActive, securityAlerts, billingDue] = await Promise.all([
    prisma.ticket.count({ where: { ...wf, status: { in: [...OPEN_STATUSES] } } }),
    prisma.device.count({ where: wf }),
    prisma.device.count({ where: { ...wf, status: 'ACTIVE' as any } }),
    // Security alerts: urządzenia bez aktualizacji >30 dni (heurystyka)
    prisma.device.count({
      where: {
        ...wf,
        updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) },
      },
    }),
    // Billing: suma do zafakturowania (tylko dla ról co widzą billing)
    (['OWNER', 'ADMIN', 'MSP'].includes(role)
      ? prisma.invoiceDocument.aggregate({
          where: { ...wf, status: { in: ['ISSUED', 'PARTIALLY_PAID'] as any } },
          _sum: { totalGross: true },
        }).catch(() => null)
      : Promise.resolve(null)),
  ]);

  return {
    openTickets: { value: openTickets, label: 'Zgłoszenia otwarte' },
    devicesOnline: {
      value: devicesActive,
      total: totalDevices,
      label: 'Urządzenia aktywne',
    },
    securityAlerts: { value: securityAlerts, label: 'Alerty bezp.' },
    billingDue: billingDue
      ? {
          value: Number(billingDue._sum.totalGross ?? 0),
          label: 'Do zafakturowania',
          currency: 'PLN',
        }
      : null,
  };
}

/** Recent activity — ActivityLog z ostatnich X */
export async function getPanelActivity(
  workspaceId: string | null | undefined,
  limit = 12,
) {
  const wf = await scopedWorkspaceFilter(workspaceId);

  const items = await prisma.activityLog.findMany({
    where: wf,
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
    select: {
      id: true,
      entityType: true,
      entityId: true,
      actionType: true,
      description: true,
      createdAt: true,
      performedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return items.map((it) => ({
    id: it.id,
    type: it.entityType,
    action: it.actionType,
    description: it.description,
    at: it.createdAt.toISOString(),
    by: it.performedBy
      ? `${it.performedBy.firstName ?? ''} ${it.performedBy.lastName ?? ''}`.trim() || null
      : null,
  }));
}
