import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateOrderInput, ChangeOrderStatusInput } from './orders.validation';
import { OrderStatus } from '@prisma/client';

const orderSelect = {
  id: true, orderNumber: true, clientId: true, ticketId: true,
  assignedToUserId: true, status: true, notes: true, createdAt: true, updatedAt: true,
  client: { select: { id: true, name: true } },
  ticket: { select: { id: true, ticketNumber: true, title: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  items: true,
};

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({ where: { orderNumber: { startsWith: `ORD-${year}-` } } });
  return `ORD-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function listOrders(params: {
  clientId?: string; status?: OrderStatus; requestingUser: { id: string; role: string };
}) {
  const { clientId, status } = params;
  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;
  return prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, select: orderSelect });
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, select: orderSelect });
  if (!order) throw new AppError('Order not found', 404);
  return order;
}

export async function createOrder(data: CreateOrderInput, createdByUserId: string) {
  const orderNumber = await generateOrderNumber();
  const order = await prisma.order.create({
    data: {
      orderNumber,
      clientId: data.clientId,
      ticketId: data.ticketId,
      createdByUserId,
      assignedToUserId: data.assignedToUserId,
      notes: data.notes,
      items: { create: data.items },
    },
    select: orderSelect,
  });
  await logActivity(prisma, {
    entityType: 'Order', entityId: order.id, actionType: 'CREATE',
    description: `Order ${order.orderNumber} created`,
    performedByUserId: createdByUserId,
  });
  return order;
}

export async function changeOrderStatus(id: string, data: ChangeOrderStatusInput, performedByUserId: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', 404);
  const updated = await prisma.order.update({
    where: { id },
    data: { status: data.status as OrderStatus },
    select: orderSelect,
  });
  await logActivity(prisma, {
    entityType: 'Order', entityId: id, actionType: 'STATUS_CHANGE',
    description: `Order ${order.orderNumber} status changed to ${data.status}`,
    performedByUserId,
    metadata: { from: order.status, to: data.status },
  });
  return updated;
}

export async function deleteOrder(id: string, performedByUserId: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', 404);
  await prisma.order.delete({ where: { id } });
  await logActivity(prisma, {
    entityType: 'Order', entityId: id, actionType: 'DELETE',
    description: `Order ${order.orderNumber} deleted`,
    performedByUserId,
  });
}
