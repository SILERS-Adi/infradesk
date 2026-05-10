/**
 * Auto-resolve job:
 * - Closes agent-sourced tickets that are stale (agent is alive but hasn't
 *   re-reported the problem in 6h — condition probably resolved itself).
 * - Resolves monitoring alerts whose underlying condition is no longer
 *   present in the agent's current serverMetrics snapshot.
 *
 * Runs every 15 minutes via scheduler.ts.
 */
import prisma from '../lib/prisma';

const TICKET_STALE_MS = 6 * 3600 * 1000; // 6h without re-report
const AGENT_ALIVE_MS  = 30 * 60 * 1000;  // agent seen in last 30 min
const ALERT_MIN_AGE_MS = 30 * 60 * 1000; // don't touch very fresh alerts

export async function autoResolveAgentTickets() {
  const staleThreshold = new Date(Date.now() - TICKET_STALE_MS);
  const aliveThreshold = new Date(Date.now() - AGENT_ALIVE_MS);

  // Open agent tickets whose updatedAt is stale
  const candidates = await prisma.ticket.findMany({
    where: {
      source: 'AGENT' as any,
      status: { in: ['NEW', 'PENDING', 'ASSIGNED'] as any },
      updatedAt: { lt: staleThreshold },
      deviceId: { not: null },
    },
    select: { id: true, ticketNumber: true, title: true, deviceId: true, workspaceId: true },
    take: 200,
  });

  if (candidates.length === 0) return { ticketsResolved: 0 };

  // For each candidate, confirm the agent is alive (otherwise we have no signal
  // that the condition actually ended — agent might just be offline).
  const deviceIds = candidates.map(c => c.deviceId!).filter(Boolean);
  const liveAgents = await prisma.agentRegistration.findMany({
    where: { deviceId: { in: deviceIds }, lastSeen: { gt: aliveThreshold }, status: 'ACTIVE' },
    select: { deviceId: true },
  });
  const liveSet = new Set(liveAgents.map(a => a.deviceId));

  const toResolve = candidates.filter(c => liveSet.has(c.deviceId));
  if (toResolve.length === 0) return { ticketsResolved: 0 };

  await prisma.ticket.updateMany({
    where: { id: { in: toResolve.map(t => t.id) } },
    data: {
      status: 'RESOLVED' as any,
      resolutionSummary: 'Auto-resolve: agent nie zgłasza tego problemu od 6h — warunek prawdopodobnie ustąpił.',
      resolvedAt: new Date(),
    },
  });

  return { ticketsResolved: toResolve.length };
}

/**
 * Check each unresolved alert against the agent's current metrics.
 * If the original condition is no longer true, mark resolved.
 */
export async function autoResolveAlerts() {
  const minAgeThreshold = new Date(Date.now() - ALERT_MIN_AGE_MS);

  const alerts = await prisma.monitoringAlert.findMany({
    where: {
      resolved: false,
      createdAt: { lt: minAgeThreshold },
    },
    select: { id: true, type: true, agentRegId: true },
    take: 500,
  });

  if (alerts.length === 0) return { alertsResolved: 0 };

  const agentIds = [...new Set(alerts.map(a => a.agentRegId!).filter(Boolean))];
  const agents = await prisma.agentRegistration.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, serverMetrics: true, lastSeen: true, status: true },
  });
  const agentMap = new Map(agents.map(a => [a.id, a]));

  const toResolve: string[] = [];
  for (const alert of alerts) {
    const agent = agentMap.get(alert.agentRegId!);
    if (!agent || agent.status !== 'ACTIVE') continue;
    // If agent hasn't sent metrics in 24h, we can't confirm — skip
    if (!agent.lastSeen || agent.lastSeen < new Date(Date.now() - 24 * 3600 * 1000)) continue;

    const sm: any = agent.serverMetrics;
    if (!sm) continue;

    let conditionCleared = false;
    switch (alert.type) {
      case 'score_drop': {
        const score = sm.securityAudit?.score;
        if (typeof score === 'number' && score >= 50) conditionCleared = true;
        break;
      }
      case 'critical_fail': {
        const checks = sm.securityAudit?.checks ?? [];
        const critFails = checks.filter((c: any) => c.status === 'fail' && c.severity === 'critical');
        if (critFails.length < 3) conditionCleared = true;
        break;
      }
      case 'disk_failing': {
        const disks = sm.smartDisks ?? [];
        const bad = disks.filter((d: any) => {
          const h = (d.health || '').toLowerCase();
          return h && h !== 'healthy' && h !== 'ok';
        });
        if (bad.length === 0) conditionCleared = true;
        break;
      }
      case 'service_down': {
        const services = sm.services ?? [];
        const crit = ['wuauserv', 'Dhcp', 'Dnscache', 'Spooler'];
        const down = services.filter((s: any) => s.status !== 'Running' && crit.includes(s.name));
        if (down.length === 0) conditionCleared = true;
        break;
      }
    }

    if (conditionCleared) toResolve.push(alert.id);
  }

  if (toResolve.length === 0) return { alertsResolved: 0 };

  await prisma.monitoringAlert.updateMany({
    where: { id: { in: toResolve } },
    data: { resolved: true },
  });

  return { alertsResolved: toResolve.length };
}

export async function runAutoResolve() {
  const t = await autoResolveAgentTickets().catch(e => ({ ticketsResolved: 0, err: e.message }));
  const a = await autoResolveAlerts().catch(e => ({ alertsResolved: 0, err: e.message }));
  if ((t as any).ticketsResolved > 0 || (a as any).alertsResolved > 0) {
    console.log('[AutoResolve]', { ...t, ...a });
  }
  return { ...t, ...a };
}
