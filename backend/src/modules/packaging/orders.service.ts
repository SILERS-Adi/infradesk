import prisma from '../../lib/prisma';
import type { CreateOrderInput } from './orders.validation';

export async function listOrders(params: { workspaceId: string; status?: string; search?: string; page?: number; perPage?: number }) {
  const { workspaceId, status, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (status) where.status = status.toUpperCase();
  if (search) {
    where.OR = [
      { externalOrderId: { contains: search, mode: 'insensitive' } },
      { addressName: { contains: search, mode: 'insensitive' } },
      { addressCity: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.packingOrder.findMany({
      where: where as any, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage,
      include: { _count: { select: { items: true } } },
    }),
    prisma.packingOrder.count({ where: where as any }),
  ]);
  return { items, total };
}

export async function getOrder(id: string, workspaceId: string) {
  return prisma.packingOrder.findFirst({ where: { id, workspaceId }, include: { items: true } });
}

export async function createOrder(data: CreateOrderInput, workspaceId: string) {
  return prisma.packingOrder.create({
    data: {
      workspaceId,
      externalOrderId: data.externalOrderId,
      status: data.status as any,
      paymentStatus: data.paymentStatus,
      totalAmount: data.totalAmount,
      buyerNote: data.buyerNote,
      internalNote: data.internalNote,
      addressName: data.addressName,
      addressStreet: data.addressStreet,
      addressCity: data.addressCity,
      addressZip: data.addressZip,
      addressPhone: data.addressPhone,
      deliveryMethod: data.deliveryMethod,
      deliveryPointId: data.deliveryPointId,
      courierName: data.courierName,
      dispatchDeadline: data.dispatchDeadline ? new Date(data.dispatchDeadline) : undefined,
      items: { create: data.items.map(i => ({ name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, imageUrl: i.imageUrl })) },
    },
    include: { items: true },
  });
}

export async function updateOrder(id: string, data: Partial<CreateOrderInput>, workspaceId: string) {
  const existing = await prisma.packingOrder.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;
  if (data.items) await prisma.packingOrderItem.deleteMany({ where: { orderId: id } });
  return prisma.packingOrder.update({
    where: { id },
    data: {
      ...(data.status && { status: data.status as any }),
      ...(data.trackingNumber !== undefined && { trackingNumber: data.trackingNumber }),
      ...(data.internalNote !== undefined && { internalNote: data.internalNote }),
      ...(data.courierName !== undefined && { courierName: data.courierName }),
      ...(data.status === 'SHIPPED' && { shippedAt: new Date() }),
      ...(data.status === 'PAID' && { paidAt: new Date() }),
      ...(data.items && { items: { create: data.items.map(i => ({ name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice })) } }),
    },
    include: { items: true },
  });
}

export async function deleteOrder(id: string, workspaceId: string) {
  const existing = await prisma.packingOrder.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.packingOrder.delete({ where: { id } });
  return true;
}
