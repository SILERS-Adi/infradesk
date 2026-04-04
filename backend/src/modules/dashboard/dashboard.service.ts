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
