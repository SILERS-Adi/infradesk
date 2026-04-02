import prisma from '../../lib/prisma';
import type { CreateShipmentInput, UpdateShipmentInput } from './packaging.validation';

const shipmentSelect = {
  id: true, workspaceId: true, orderNumber: true,
  customerName: true, customerEmail: true, customerPhone: true,
  status: true, courier: true, trackingNumber: true, totalWeight: true,
  notes: true, createdById: true, createdAt: true, updatedAt: true,
  items: true,
};

export async function listShipments(params: {
  workspaceId: string; status?: string; courier?: string; search?: string;
  page?: number; perPage?: number;
}) {
  const { workspaceId, status, courier, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (status) where.status = status.toUpperCase();
  if (courier) where.courier = courier;
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, orderNumber: true, customerName: true, status: true,
        courier: true, totalWeight: true, createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.shipment.count({ where: where as any }),
  ]);

  const mapped = items.map(s => ({
    id: s.id,
    orderNumber: s.orderNumber,
    clientName: s.customerName,
    status: s.status.toLowerCase(),
    courier: s.courier,
    itemCount: s._count.items,
    totalWeight: s.totalWeight,
    createdAt: s.createdAt.toISOString().slice(0, 10),
  }));

  return { items: mapped, total };
}

export async function getShipment(id: string, workspaceId: string) {
  const s = await prisma.shipment.findFirst({
    where: { id, workspaceId },
    select: shipmentSelect,
  });
  if (!s) return null;

  return {
    id: s.id,
    orderNumber: s.orderNumber,
    clientName: s.customerName,
    clientEmail: s.customerEmail,
    clientPhone: s.customerPhone,
    status: s.status.toLowerCase(),
    courier: s.courier,
    trackingNumber: s.trackingNumber,
    totalWeight: s.totalWeight,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    packedAt: s.status === 'PACKED' || s.status === 'SHIPPED' || s.status === 'DELIVERED' ? s.updatedAt.toISOString() : null,
    shippedAt: s.status === 'SHIPPED' || s.status === 'DELIVERED' ? s.updatedAt.toISOString() : null,
    items: s.items.map(i => ({
      id: i.id,
      name: i.name,
      sku: i.sku || '',
      quantity: i.quantity,
      weight: i.weight,
    })),
  };
}

export async function createShipment(data: CreateShipmentInput, workspaceId: string, userId: string) {
  const totalWeight = data.items.reduce((s, i) => s + i.weight * i.quantity, 0);

  const shipment = await prisma.shipment.create({
    data: {
      workspaceId,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      status: data.status as any,
      courier: data.courier,
      trackingNumber: data.trackingNumber,
      totalWeight,
      notes: data.notes,
      createdById: userId,
      items: {
        create: data.items.map(i => ({
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
          weight: i.weight,
        })),
      },
    },
    select: shipmentSelect,
  });
  return shipment;
}

export async function updateShipment(id: string, data: UpdateShipmentInput, workspaceId: string) {
  const existing = await prisma.shipment.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;

  if (data.items) {
    await prisma.shipmentItem.deleteMany({ where: { shipmentId: id } });
  }

  const totalWeight = data.items
    ? data.items.reduce((s, i) => s + (i.weight || 0) * (i.quantity || 1), 0)
    : undefined;

  return prisma.shipment.update({
    where: { id },
    data: {
      ...(data.orderNumber !== undefined && { orderNumber: data.orderNumber }),
      ...(data.customerName !== undefined && { customerName: data.customerName }),
      ...(data.customerEmail !== undefined && { customerEmail: data.customerEmail }),
      ...(data.status !== undefined && { status: data.status as any }),
      ...(data.courier !== undefined && { courier: data.courier }),
      ...(data.trackingNumber !== undefined && { trackingNumber: data.trackingNumber }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(totalWeight !== undefined && { totalWeight }),
      ...(data.items && {
        items: { create: data.items.map(i => ({ name: i.name, sku: i.sku, quantity: i.quantity, weight: i.weight })) },
      }),
    },
    select: shipmentSelect,
  });
}

export async function deleteShipment(id: string, workspaceId: string) {
  const existing = await prisma.shipment.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.shipment.delete({ where: { id } });
  return true;
}
