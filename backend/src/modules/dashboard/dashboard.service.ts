import prisma from '../../lib/prisma';

export async function getAdminDashboard(workspaceId?: string | null) {
  // MSP scope: include client workspaces
  let wsIds: string[] | null = null;
  if (workspaceId) {
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    wsIds = await getMspWorkspaceIds(workspaceId);
  }
  const wf = wsIds && wsIds.length > 1 ? { workspaceId: { in: wsIds } } : (workspaceId ? { workspaceId } : {});
  const [
    totalLocations,
    totalDevices,
    openTickets,
    overdueTickets,
    unassignedTickets,
    recentTickets,
    recentDevices,
  ] = await Promise.all([
    prisma.location.count({ where: wf }),
    prisma.device.count({ where: wf }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['PENDING', 'ASSIGNED'] } } }),
    prisma.ticket.count({
      where: {
        ...wf,
        status: { in: ['PENDING', 'ASSIGNED'] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.ticket.count({
      where: {
        ...wf,
        status: 'PENDING',
      },
    }),
    prisma.ticket.findMany({
      where: wf,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        source: true,
        reportedAt: true,
        createdAt: true,
        assignedToUserId: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.device.findMany({
      where: wf,
      take: 6,
      orderBy: { updatedAt: 'desc' },
      include: {
        location: { select: { id: true, name: true } },
      },
    }),
  ]);

  // ── Trend data: today vs yesterday, this week vs last week ──
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const dow = now.getDay();
  const offsetToMon = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - offsetToMon); weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  const [
    createdToday, createdYesterday,
    closedToday, closedYesterday,
    closedThisWeek, closedLastWeek,
  ] = await Promise.all([
    prisma.ticket.count({ where: { ...wf, createdAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { ...wf, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { gte: todayStart } } }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { gte: weekStart } } }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { gte: lastWeekStart, lt: weekStart } } }),
  ]);

  // Rating stats
  const ratedTickets = await prisma.ticket.findMany({
    where: { ...wf, rating: { not: null } },
    select: { rating: true },
  });
  const ratingCount = ratedTickets.length;
  const ratingAvg = ratingCount > 0
    ? Math.round((ratedTickets.reduce((sum, t) => sum + (t.rating ?? 0), 0) / ratingCount) * 10) / 10
    : null;

  // Onboarding status — check if workspace completed setup
  let onboarding = { completed: true, steps: { company: true, location: true, device: true, agent: true, ticket: true } };
  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, legalName: true, taxId: true },
    });
    const hasAgents = await prisma.agentRegistration.count({ where: { workspaceId, status: 'ACTIVE' } });
    const hasTickets = await prisma.ticket.count({ where: { workspaceId }, take: 1 });

    onboarding = {
      completed: totalLocations > 0 && totalDevices > 0,
      steps: {
        company: !!(ws?.legalName || ws?.taxId),
        location: totalLocations > 0,
        device: totalDevices > 0,
        agent: hasAgents > 0,
        ticket: hasTickets > 0,
      },
    };
  }

  // SLA compliance
  let sla = { compliancePct: 100, breached: 0, nearBreach: 0 };
  if (workspaceId) {
    const [slaTotal, slaBreach, slaNear] = await Promise.all([
      prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, dueAt: { not: null } } }),
      prisma.ticket.count({ where: { ...wf, slaBreached: true } }),
      prisma.ticket.count({
        where: { ...wf, status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] }, dueAt: { not: null, lt: new Date(Date.now() + 4 * 3600000) } },
      }),
    ]);
    sla = {
      compliancePct: slaTotal > 0 ? Math.round(((slaTotal - slaBreach) / slaTotal) * 100) : 100,
      breached: slaBreach,
      nearBreach: slaNear,
    };
  }

  return {
    totalLocations,
    totalDevices,
    openTickets,
    overdueTickets,
    unassignedTickets,
    myTickets: openTickets,
    recentTickets,
    recentDevices,
    ratingAvg,
    ratingCount,
    onboarding,
    sla,
    recentActivity: await prisma.ticket.findMany({
      where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 8,
      select: {
        id: true, ticketNumber: true, title: true, resolvedAt: true,
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    }),
    upcomingDeadlines: await prisma.ticket.findMany({
      where: {
        ...wf,
        status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        dueAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) },
      },
      orderBy: { dueAt: 'asc' },
      take: 6,
      select: {
        id: true, ticketNumber: true, title: true, priority: true, dueAt: true,
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    }),
    chartData: await (async () => {
      const days: { date: string; created: number; closed: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 86400000);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const [c, r] = await Promise.all([
          prisma.ticket.count({ where: { ...wf, createdAt: { gte: dayStart, lt: dayEnd } } }),
          prisma.ticket.count({ where: { ...wf, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, resolvedAt: { gte: dayStart, lt: dayEnd } } }),
        ]);
        days.push({ date: dayStart.toISOString().slice(0, 10), created: c, closed: r });
      }
      return days;
    })(),
    trends: {
      createdToday,
      createdYesterday,
      closedToday,
      closedYesterday,
      closedThisWeek,
      closedLastWeek,
    },
  };
}

export async function getClientDashboard(workspaceId: string) {
  const wf = { workspaceId };

  const [
    totalDevices,
    activeDevices,
    brokenDevices,
    totalTickets,
    openTickets,
    resolvedTickets,
    totalLocations,
    recentTickets,
    recentDevices,
  ] = await Promise.all([
    prisma.device.count({ where: wf }),
    prisma.device.count({ where: { ...wf, status: 'ACTIVE' } }),
    prisma.device.count({ where: { ...wf, status: 'BROKEN' } }),
    prisma.ticket.count({ where: wf }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['PENDING', 'ASSIGNED'] } } }),
    prisma.ticket.count({ where: { ...wf, status: { in: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.location.count({ where: wf }),
    prisma.ticket.findMany({
      where: wf,
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.device.findMany({
      where: wf,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        criticality: true,
        ipAddress: true,
        hostname: true,
        location: { select: { id: true, name: true } },
        deviceType: { select: { id: true, name: true, icon: true } },
      },
    }),
  ]);

  return {
    stats: {
      totalDevices,
      activeDevices,
      brokenDevices,
      totalTickets,
      openTickets,
      resolvedTickets,
      totalLocations,
    },
    recentTickets,
    recentDevices,
  };
}
