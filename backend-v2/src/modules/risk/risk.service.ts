import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Client Risk Score — 0..100 (higher = more risky).
 *
 * Weighted components (sum = 100 max):
 *   payment (25)     — overdue invoices, cadence of late payments
 *   tickets (25)     — volume spike vs 30-day baseline + OPEN/WAITING count
 *   sla     (15)     — breaches in last 30 days
 *   churn   (20)     — negative signals (rating 1s, cancelled tickets, long inactivity)
 *   devices (15)     — mix of CRITICAL devices without active monitoring
 *
 * Explainability: `factors` field stores human-readable reasons.
 */

export interface RiskBreakdown {
  payment: number;
  tickets: number;
  sla: number;
  churn: number;
  devices: number;
}

export interface ScoringResult {
  score: number;
  breakdown: RiskBreakdown;
  factors: string[];
}

const WEIGHTS = { payment: 25, tickets: 25, sla: 15, churn: 20, devices: 15 } as const;

function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }

export async function computeScore(workspaceId: string, _clientWorkspaceId: string): Promise<ScoringResult> {
  const now = new Date();
  const days = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const factors: string[] = [];

  // --- Payment (placeholder until invoice module enriched) -----------------
  // We approximate via InvoiceStatus != PAID beyond dueDate (schema-aware).
  let paymentPct = 0;
  try {
    const overdue = await prisma.invoice.count({
      where: { workspaceId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as never }, dueDate: { lt: now } },
    });
    if (overdue > 0) {
      paymentPct = clamp(overdue * 25, 0, 100);
      factors.push(`${overdue}× faktura po terminie`);
    }
  } catch { /* Invoice relation may not yet be wired for this client */ }

  // --- Tickets volume spike -----------------------------------------------
  const last7 = await prisma.ticket.count({
    where: { workspaceId, createdAt: { gte: days(7) }, deletedAt: null, OR: [{ deviceId: { not: null } }] },
  });
  const last30 = await prisma.ticket.count({
    where: { workspaceId, createdAt: { gte: days(30) }, deletedAt: null },
  });
  const baseline = Math.max(1, last30 / 4); // avg-per-week over 30d
  const spike = last7 / baseline;
  let ticketsPct = 0;
  if (spike > 2) {
    ticketsPct = clamp((spike - 1) * 30, 0, 100);
    factors.push(`${last7} ticketów ostatnie 7 dni (baseline ${baseline.toFixed(0)}/7d) — ${spike.toFixed(1)}× skok`);
  }
  const openCritical = await prisma.ticket.count({
    where: { workspaceId, status: { in: ['OPEN', 'WAITING'] }, priority: { in: ['HIGH', 'CRITICAL'] }, deletedAt: null },
  });
  if (openCritical > 0) {
    ticketsPct = clamp(ticketsPct + openCritical * 15, 0, 100);
    factors.push(`${openCritical}× CRITICAL/HIGH ticket otwarty`);
  }

  // --- SLA breaches --------------------------------------------------------
  const breaches = await prisma.ticket.count({
    where: { workspaceId, slaBreached: true, createdAt: { gte: days(30) } },
  });
  let slaPct = 0;
  if (breaches > 0) {
    slaPct = clamp(breaches * 25, 0, 100);
    factors.push(`${breaches}× naruszenie SLA w ostatnich 30 dniach`);
  }

  // --- Churn signals -------------------------------------------------------
  const sad = await prisma.ticket.count({ where: { workspaceId, rating: 1, ratedAt: { gte: days(60) } } });
  const cancelled = await prisma.ticket.count({ where: { workspaceId, status: 'CANCELLED', createdAt: { gte: days(60) } } });
  let churnPct = 0;
  if (sad > 0) {
    churnPct = clamp(churnPct + sad * 25, 0, 100);
    factors.push(`${sad}× ocena „smutna" (1/3) w ostatnich 60 dniach`);
  }
  if (cancelled > 0) {
    churnPct = clamp(churnPct + cancelled * 10, 0, 100);
    factors.push(`${cancelled}× anulowany ticket`);
  }

  // --- Device mix ----------------------------------------------------------
  const critDevicesWithoutAgent = await prisma.device.count({
    where: { workspaceId, deletedAt: null, criticality: 'CRITICAL', agent: null },
  });
  let devicesPct = 0;
  if (critDevicesWithoutAgent > 0) {
    devicesPct = clamp(critDevicesWithoutAgent * 20, 0, 100);
    factors.push(`${critDevicesWithoutAgent}× urządzenie CRITICAL bez agenta monitorującego`);
  }

  const breakdown: RiskBreakdown = {
    payment: Math.round((paymentPct * WEIGHTS.payment) / 100),
    tickets: Math.round((ticketsPct * WEIGHTS.tickets) / 100),
    sla: Math.round((slaPct * WEIGHTS.sla) / 100),
    churn: Math.round((churnPct * WEIGHTS.churn) / 100),
    devices: Math.round((devicesPct * WEIGHTS.devices) / 100),
  };
  const score = clamp(breakdown.payment + breakdown.tickets + breakdown.sla + breakdown.churn + breakdown.devices);

  if (factors.length === 0) factors.push('Brak sygnałów ryzyka — klient stabilny');

  return { score, breakdown, factors };
}

export async function persistScore(workspaceId: string, clientWorkspaceId: string): Promise<{ id: string; score: number; trend7d: number }> {
  const result = await computeScore(workspaceId, clientWorkspaceId);
  const prev = await prisma.clientRiskScore.findFirst({
    where: { workspaceId, clientWorkspaceId, computedAt: { lt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) } },
    orderBy: { computedAt: 'desc' },
    select: { score: true },
  });
  const trend7d = prev ? result.score - prev.score : 0;
  const row = await prisma.clientRiskScore.create({
    data: {
      workspaceId,
      clientWorkspaceId,
      score: result.score,
      trend7d,
      components: result.breakdown as unknown as Prisma.InputJsonValue,
      factors: result.factors as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, score: true, trend7d: true },
  });
  return row;
}

export async function latestForAllClients(workspaceId: string): Promise<Array<{ clientWorkspaceId: string; score: number; trend7d: number; factors: unknown; computedAt: Date }>> {
  // Get the latest score per client (one row per clientWorkspaceId).
  const rows = await prisma.$queryRaw<Array<{ clientWorkspaceId: string; score: number; trend7d: number; factors: unknown; computedAt: Date }>>`
    SELECT DISTINCT ON ("clientWorkspaceId") "clientWorkspaceId", score, "trend7d", factors, "computedAt"
    FROM "ClientRiskScore"
    WHERE "workspaceId" = ${workspaceId}
    ORDER BY "clientWorkspaceId", "computedAt" DESC
  `;
  return rows;
}
