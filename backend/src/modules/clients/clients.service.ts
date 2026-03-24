import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateClientInput, UpdateClientInput } from './clients.validation';
import { ClientStatus } from '@prisma/client';

export async function listClients(params: {
  status?: ClientStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { status, search, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            locations: true,
            tickets: {
              where: { status: { in: ['PENDING', 'ASSIGNED'] } },
            },
            devices: true,
          },
        },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return {
    data: clients.map((c) => ({
      ...c,
      locationCount: c._count.locations,
      openTicketCount: c._count.tickets,
      deviceCount: c._count.devices,
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

export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      locations: {
        include: {
          _count: { select: { devices: true } },
        },
        orderBy: { name: 'asc' },
      },
      _count: {
        select: {
          devices: true,
          tickets: true,
          credentials: true,
          users: true,
        },
      },
    },
  });

  if (!client) {
    throw new AppError('Client not found', 404);
  }

  // Stats
  const [openTickets, closedTickets] = await Promise.all([
    prisma.ticket.count({
      where: { clientId: id, status: { in: ['PENDING', 'ASSIGNED'] } },
    }),
    prisma.ticket.count({
      where: { clientId: id, status: { in: ['COMPLETED', 'CANCELLED'] } },
    }),
  ]);

  return {
    ...client,
    stats: {
      totalDevices: client._count.devices,
      totalTickets: client._count.tickets,
      openTickets,
      closedTickets,
      totalCredentials: client._count.credentials,
      totalUsers: client._count.users,
    },
  };
}

export async function checkTaxId(taxId: string, excludeId?: string) {
  const existing = await prisma.client.findFirst({
    where: {
      taxId: { equals: taxId.replace(/[\s-]/g, ''), mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
  return { exists: !!existing, clientName: existing?.name };
}

export async function createClient(data: CreateClientInput, performedByUserId: string) {
  const client = await prisma.client.create({
    data: {
      clientType: data.clientType ?? 'COMPANY',
      name: data.name,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      legalName: data.legalName,
      taxId: data.taxId,
      email: data.email || null,
      phone: data.phone,
      website: data.website,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      postalCode: data.postalCode,
      city: data.city,
      country: data.country ?? 'PL',
      notes: data.notes,
      logoUrl: data.logoUrl || null,
      status: data.status as ClientStatus,
      billingIntervalMinutes: data.billingIntervalMinutes ?? 30,
      contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null,
      hasContract: data.hasContract ?? false,
      contractHours: data.contractHours ?? null,
      contractMonthlyValue: data.contractMonthlyValue ?? null,
      contractHourlyRateOverLimit: data.contractHourlyRateOverLimit ?? null,
      contractScope: data.contractScope ?? null,
      contractAttachmentUrl: data.contractAttachmentUrl ?? null,
      hourlyRate: data.hourlyRate ?? null,
    },
  });

  await logActivity(prisma, {
    entityType: 'Client',
    entityId: client.id,
    actionType: 'CREATE',
    description: `Client "${client.name}" created`,
    performedByUserId,
  });

  return client;
}

export async function updateClient(id: string, data: UpdateClientInput, performedByUserId: string) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Client not found', 404);
  }

  const client = await prisma.client.update({
    where: { id },
    data: {
      ...data,
      status: data.status as ClientStatus | undefined,
    },
  });

  await logActivity(prisma, {
    entityType: 'Client',
    entityId: id,
    actionType: 'UPDATE',
    description: `Client "${client.name}" updated`,
    performedByUserId,
  });

  return client;
}

export async function deactivateClient(id: string, performedByUserId: string) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Client not found', 404);
  }

  await prisma.client.update({
    where: { id },
    data: { status: 'INACTIVE' },
  });

  await logActivity(prisma, {
    entityType: 'Client',
    entityId: id,
    actionType: 'DEACTIVATE',
    description: `Client "${existing.name}" deactivated`,
    performedByUserId,
  });
}

export async function hardDeleteClient(id: string, performedByUserId: string) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Client not found', 404);
  }

  await logActivity(prisma, {
    entityType: 'Client',
    entityId: id,
    actionType: 'DELETE',
    description: `Client "${existing.name}" permanently deleted`,
    performedByUserId,
  });

  await prisma.client.delete({ where: { id } });
}

export async function toggleFavorite(clientId: string, userId: string) {
  const existing = await prisma.clientFavorite.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
  if (existing) {
    await prisma.clientFavorite.delete({ where: { userId_clientId: { userId, clientId } } });
    return { isFavorite: false };
  } else {
    await prisma.clientFavorite.create({ data: { userId, clientId } });
    return { isFavorite: true };
  }
}

export async function getUserFavoriteClientIds(userId: string): Promise<string[]> {
  const favs = await prisma.clientFavorite.findMany({
    where: { userId },
    select: { clientId: true },
  });
  return favs.map(f => f.clientId);
}
