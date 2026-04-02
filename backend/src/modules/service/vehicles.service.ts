import prisma from '../../lib/prisma';
import type { CreateVehicleInput, UpdateVehicleInput } from './vehicles.validation';

export async function listVehicles(params: { workspaceId: string; search?: string; page?: number; perPage?: number }) {
  const { workspaceId, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (search) {
    where.OR = [
      { plate: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { model: { contains: search, mode: 'insensitive' } },
      { ownerName: { contains: search, mode: 'insensitive' } },
      { vin: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.serviceVehicle.findMany({ where: where as any, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { _count: { select: { inspections: true } } } }),
    prisma.serviceVehicle.count({ where: where as any }),
  ]);
  return { items, total };
}

export async function getVehicle(id: string, workspaceId: string) {
  return prisma.serviceVehicle.findFirst({ where: { id, workspaceId }, include: { inspections: { orderBy: { scheduledAt: 'desc' }, take: 20 } } });
}

export async function createVehicle(data: CreateVehicleInput, workspaceId: string) {
  return prisma.serviceVehicle.create({ data: { ...data, workspaceId } });
}

export async function updateVehicle(id: string, data: UpdateVehicleInput, workspaceId: string) {
  const existing = await prisma.serviceVehicle.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;
  return prisma.serviceVehicle.update({ where: { id }, data });
}

export async function deleteVehicle(id: string, workspaceId: string) {
  const existing = await prisma.serviceVehicle.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.serviceVehicle.delete({ where: { id } });
  return true;
}
