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
