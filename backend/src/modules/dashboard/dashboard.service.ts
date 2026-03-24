import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';

export async function getAdminDashboard() {
  const [
    totalClients,
    totalLocations,
    totalDevices,
    openTickets,
    overdueTickets,
    unassignedTickets,
    recentTickets,
    recentDevices,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.location.count(),
    prisma.device.count(),
    prisma.ticket.count({ where: { status: { in: ['PENDING', 'ASSIGNED'] } } }),
    prisma.ticket.count({
      where: {
        status: { in: ['PENDING', 'ASSIGNED'] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.ticket.count({
      where: {
        status: 'PENDING',
      },
    }),
    prisma.ticket.findMany({
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
        client: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.device.findMany({
      take: 6,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    totalClients,
    totalLocations,
    totalDevices,
    openTickets,
    overdueTickets,
    unassignedTickets,
    myTickets: openTickets,
    recentTickets,
    recentDevices,
  };
}

export async function getClientDashboard(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, status: true },
  });

  if (!client) {
    throw new AppError('Client not found', 404);
  }

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
    prisma.device.count({ where: { clientId } }),
    prisma.device.count({ where: { clientId, status: 'ACTIVE' } }),
    prisma.device.count({ where: { clientId, status: 'BROKEN' } }),
    prisma.ticket.count({ where: { clientId } }),
    prisma.ticket.count({ where: { clientId, status: { in: ['PENDING', 'ASSIGNED'] } } }),
    prisma.ticket.count({ where: { clientId, status: { in: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.location.count({ where: { clientId } }),
    prisma.ticket.findMany({
      where: { clientId },
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
      where: { clientId },
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
    client,
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
