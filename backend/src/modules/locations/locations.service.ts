import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateLocationInput, UpdateLocationInput } from './locations.validation';

export async function listLocations(params: {
  workspaceId?: string | null;
  page?: number;
  limit?: number;
  scopeFilter?: Record<string, unknown>;
  requestingUser?: any;
}) {
  const { workspaceId, page = 1, limit: rawLimit = 50, scopeFilter } = params;
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (workspaceId) {
    where.workspaceId = workspaceId;
  }
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), scopeFilter];
  }

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
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

export async function getLocationById(id: string, workspaceId?: string, _requestingUser?: any) {
  const location = await prisma.location.findFirst({
    where: { id, ...(workspaceId ? { workspaceId } : {}) },
    include: {
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

  return {
    ...location,
    deviceCount: location._count.devices,
    ticketCount: location._count.tickets,
    _count: undefined,
  };
}

export async function createLocation(data: CreateLocationInput & { workspaceId: string }, performedByUserId: string) {
  const location = await prisma.location.create({ data });

  await logActivity(prisma, {
    entityType: 'Location',
    entityId: location.id,
    actionType: 'CREATE',
    description: `Location "${location.name}" created`,
    performedByUserId,
  });

  return location;
}

export async function updateLocation(id: string, data: UpdateLocationInput, performedByUserId: string, workspaceId?: string) {
  const existing = await prisma.location.findFirst({
    where: { id, ...(workspaceId ? { workspaceId } : {}) },
  });
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

export async function deleteLocation(id: string, performedByUserId: string, workspaceId?: string) {
  const existing = await prisma.location.findFirst({
    where: { id, ...(workspaceId ? { workspaceId } : {}) },
  });
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
