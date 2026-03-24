import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateLocationInput, UpdateLocationInput } from './locations.validation';

export async function listLocations(params: {
  clientId?: string;
  page?: number;
  limit?: number;
  requestingUser: { role: string; clientId?: string | null };
}) {
  const { clientId, page = 1, limit = 50, requestingUser } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (requestingUser.role === 'CLIENT') {
    where.clientId = requestingUser.clientId;
  } else if (clientId) {
    where.clientId = clientId;
  }

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { devices: true } },
      },
    }),
    prisma.location.count({ where }),
  ]);

  return {
    data: locations.map((l) => ({
      ...l,
      deviceCount: l._count.devices,
      _count: undefined,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getLocationById(id: string, requestingUser: { role: string; clientId?: string | null }) {
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      devices: {
        select: {
          id: true,
          name: true,
          status: true,
          criticality: true,
          ipAddress: true,
          hostname: true,
          deviceType: { select: { id: true, name: true, icon: true } },
        },
        orderBy: { name: 'asc' },
      },
      _count: { select: { devices: true, tickets: true } },
    },
  });

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  if (requestingUser.role === 'CLIENT' && location.clientId !== requestingUser.clientId) {
    throw new AppError('Access denied', 403);
  }

  return {
    ...location,
    deviceCount: location._count.devices,
    ticketCount: location._count.tickets,
    _count: undefined,
  };
}

export async function createLocation(data: CreateLocationInput, performedByUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) {
    throw new AppError('Client not found', 404);
  }

  const location = await prisma.location.create({ data });

  await logActivity(prisma, {
    entityType: 'Location',
    entityId: location.id,
    actionType: 'CREATE',
    description: `Location "${location.name}" created for client "${client.name}"`,
    performedByUserId,
  });

  return location;
}

export async function updateLocation(id: string, data: UpdateLocationInput, performedByUserId: string) {
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Location not found', 404);
  }

  const location = await prisma.location.update({
    where: { id },
    data,
  });

  await logActivity(prisma, {
    entityType: 'Location',
    entityId: id,
    actionType: 'UPDATE',
    description: `Location "${location.name}" updated`,
    performedByUserId,
  });

  return location;
}

export async function deleteLocation(id: string, performedByUserId: string) {
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Location not found', 404);
  }

  await prisma.location.delete({ where: { id } });

  await logActivity(prisma, {
    entityType: 'Location',
    entityId: id,
    actionType: 'DELETE',
    description: `Location "${existing.name}" deleted`,
    performedByUserId,
  });
}
