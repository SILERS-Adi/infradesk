import prisma from '../../lib/prisma';
import type { CreateInspectionInput, UpdateInspectionInput } from './inspections.validation';

export async function listInspections(params: { workspaceId: string; status?: string; search?: string; page?: number; perPage?: number }) {
  const { workspaceId, status, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (status) where.status = status.toUpperCase();
  if (search) {
    where.OR = [
      { inspectionNumber: { contains: search, mode: 'insensitive' } },
      { technicianName: { contains: search, mode: 'insensitive' } },
      { vehicle: { plate: { contains: search, mode: 'insensitive' } } },
      { vehicle: { ownerName: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.serviceInspection.findMany({
      where: where as any, orderBy: { scheduledAt: 'desc' }, skip: (page - 1) * perPage, take: perPage,
      include: { vehicle: { select: { id: true, plate: true, brand: true, model: true, ownerName: true } } },
    }),
    prisma.serviceInspection.count({ where: where as any }),
  ]);
  return { items, total };
}

export async function getInspection(id: string, workspaceId: string) {
  return prisma.serviceInspection.findFirst({
    where: { id, workspaceId },
    include: { vehicle: true },
  });
}

export async function createInspection(data: CreateInspectionInput, workspaceId: string, userId: string) {
  const vehicle = await prisma.serviceVehicle.findFirst({ where: { id: data.vehicleId, workspaceId } });
  if (!vehicle) return null;
  return prisma.serviceInspection.create({
    data: {
      workspaceId,
      vehicleId: data.vehicleId,
      inspectionNumber: data.inspectionNumber,
      type: data.type as any,
      status: data.status as any,
      result: data.result as any || undefined,
      scheduledAt: new Date(data.scheduledAt),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      technicianName: data.technicianName,
      notes: data.notes,
      mileage: data.mileage,
      createdById: userId,
    },
    include: { vehicle: { select: { plate: true, brand: true, model: true } } },
  });
}

export async function updateInspection(id: string, data: UpdateInspectionInput, workspaceId: string) {
  const existing = await prisma.serviceInspection.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;
  return prisma.serviceInspection.update({
    where: { id },
    data: {
      ...(data.type && { type: data.type as any }),
      ...(data.status && { status: data.status as any }),
      ...(data.result !== undefined && { result: data.result as any || null }),
      ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
      ...(data.completedAt !== undefined && { completedAt: data.completedAt ? new Date(data.completedAt) : null }),
      ...(data.technicianName !== undefined && { technicianName: data.technicianName }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.mileage !== undefined && { mileage: data.mileage }),
      ...(data.inspectionNumber !== undefined && { inspectionNumber: data.inspectionNumber }),
    },
  });
}

export async function deleteInspection(id: string, workspaceId: string) {
  const existing = await prisma.serviceInspection.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.serviceInspection.delete({ where: { id } });
  return true;
}
