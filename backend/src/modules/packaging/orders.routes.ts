import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

/**
 * GET / — List orders (paginated, filterable, sortable)
 * Matches PakOps: GET /orders/
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const {
      status,
      search,
      page: pageStr,
      per_page: perPageStr,
      sort: sortParam,
      order: orderParam,
    } = req.query as Record<string, string>;

    const page = pageStr ? Math.max(1, parseInt(pageStr)) : 1;
    const perPage = perPageStr ? Math.min(100, Math.max(1, parseInt(perPageStr))) : 20;

    // Build where clause
    const where: any = { workspaceId };

    if (status) {
      const statuses = status.split(',').map(s => s.trim().toUpperCase());
      where.status = { in: statuses };
    }

    if (search) {
      where.OR = [
        { externalId: { contains: search, mode: 'insensitive' } },
        { addressName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Count
    const total = await prisma.shipment.count({ where });

    // Sort — frontend sends sort=createdAt&order=desc
    const fieldName = sortParam || 'createdAt';
    const fieldMap: Record<string, string> = {
      allegro_created_at: 'createdAt',
      created_at: 'createdAt',
      total_amount: 'totalAmount',
      externalOrderId: 'externalId',
    };
    const prismaField = fieldMap[fieldName] || fieldName;
    const sortDirection = orderParam === 'asc' ? 'asc' : 'desc';
    const orderBy: any = { [prismaField]: sortDirection };

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        items: true,
        customer: {
          select: {
            id: true, firstName: true, lastName: true, login: true,
            email: true, phone: true, companyName: true,
          },
        },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const items = shipments.map(o => {
      return {
        id: o.id,
        externalOrderId: o.externalId || o.orderNumber || null,
        status: o.status,
        paymentStatus: o.paymentStatus || 'pending',
        totalAmount: o.totalAmount || 0,
        addressName: o.addressName || null,
        addressCity: o.addressCity || null,
        addressPhone: o.addressPhone || (o.customer?.phone) || null,
        courierName: o.deliveryMethod || null,
        deliveryMethod: o.deliveryMethod || null,
        dispatchDeadline: o.dispatchDeadline ? o.dispatchDeadline.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        _count: { items: o.items.length },
      };
    });

    res.json({
      items,
      total,
      page,
      per_page: perPage,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
});

/**
 * GET /stats — Order stats by status + revenue
 * Matches PakOps: GET /orders/stats
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      select: { status: true, totalAmount: true, createdAt: true },
    });

    // Status counts (lowercase keys)
    const counts: Record<string, number> = {};
    for (const s of shipments) {
      const key = s.status.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let revenueToday = 0;
    let revenueMonth = 0;
    for (const s of shipments) {
      if (s.createdAt >= todayStart) revenueToday += s.totalAmount || 0;
      if (s.createdAt >= monthStart) revenueMonth += s.totalAmount || 0;
    }

    res.json({
      total: shipments.length,
      new: counts['new'] || 0,
      paid: counts['paid'] || 0,
      packing: counts['packing'] || 0,
      packed: counts['packed'] || 0,
      shipped: counts['shipped'] || 0,
      delivered: counts['delivered'] || 0,
      cancelled: counts['cancelled'] || 0,
      revenue_today: revenueToday,
      revenue_month: revenueMonth,
    });
  } catch (err) { next(err); }
});

/**
 * GET /:id — Single order detail with items, status history, customer
 * Matches PakOps: GET /orders/{order_id}
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const order = await prisma.shipment.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
        customer: true,
      },
    });

    if (!order) {
      res.status(404).json({ detail: 'Order not found' });
      return;
    }

    let customerName: string | null = null;
    let customerData: any = null;
    if (order.customer) {
      const c = order.customer;
      const parts = [c.firstName || '', c.lastName || ''].filter(Boolean);
      customerName = parts.join(' ') || c.login || null;
      customerData = {
        id: c.id,
        login: c.login,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
        company_name: c.companyName,
        phone: c.phone,
      };
    }

    res.json({
      id: order.id,
      externalOrderId: order.externalId || order.orderNumber || null,
      status: order.status,
      paymentStatus: (order.paymentStatus || 'pending').toUpperCase(),
      totalAmount: order.totalAmount || 0,
      addressName: order.addressName || customerName || null,
      addressStreet: order.addressStreet || null,
      addressCity: order.addressCity || null,
      addressZip: order.addressZip || null,
      addressPhone: order.addressPhone || null,
      addressEmail: order.customer?.email || null,
      courierName: order.deliveryMethod || null,
      deliveryMethod: order.deliveryMethod || null,
      trackingNumber: (order as any).trackingNumber || null,
      notes: order.buyerNote || null,
      internalNotes: order.internalNote || null,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      packedAt: (order as any).packedAt ? (order as any).packedAt.toISOString() : null,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      deliveredAt: (order as any).deliveredAt ? (order as any).deliveredAt.toISOString() : null,
      packingSessionId: null,
      items: order.items.map(i => ({
        id: i.id,
        name: i.name,
        sku: i.sku || null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        image: i.imageUrl || null,
      })),
      statusHistory: order.statusHistory.map(h => ({
        status: (h.newStatus || '').toUpperCase(),
        changedAt: h.createdAt.toISOString(),
        changedBy: null,
      })),
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /:id — Update order status / internal_note
 * Matches PakOps: PATCH /orders/{order_id}
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { status, internal_note, internalNotes } = req.body;

    const order = await prisma.shipment.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!order) {
      res.status(404).json({ detail: 'Order not found' });
      return;
    }

    const updates: any = {};

    if (status && status.toUpperCase() !== order.status) {
      const newStatus = status.toUpperCase();
      updates.status = newStatus;

      // Create status history entry
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: order.id,
          oldStatus: order.status.toLowerCase(),
          newStatus: status.toLowerCase(),
          changedById: userId,
          note: `Zmiana statusu`,
        },
      });

      if (newStatus === 'SHIPPED' && !order.shippedAt) {
        updates.shippedAt = new Date();
      }
    }

    // Accept both camelCase (frontend) and snake_case (legacy)
    const noteValue = internalNotes !== undefined ? internalNotes : internal_note;
    if (noteValue !== undefined) {
      updates.internalNote = noteValue;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.shipment.update({
        where: { id: order.id },
        data: updates,
      });
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

/**
 * PUT /:id — Update order (frontend uses PUT for status changes)
 * Delegates to the same logic as PATCH
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { status, internal_note, internalNotes } = req.body;

    const order = await prisma.shipment.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!order) {
      res.status(404).json({ detail: 'Order not found' });
      return;
    }

    const updates: any = {};

    if (status && status.toUpperCase() !== order.status) {
      const newStatus = status.toUpperCase();
      updates.status = newStatus;

      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: order.id,
          oldStatus: order.status.toLowerCase(),
          newStatus: status.toLowerCase(),
          changedById: userId,
          note: `Zmiana statusu`,
        },
      });

      if (newStatus === 'SHIPPED' && !order.shippedAt) {
        updates.shippedAt = new Date();
      }
    }

    const noteValue = internalNotes !== undefined ? internalNotes : internal_note;
    if (noteValue !== undefined) {
      updates.internalNote = noteValue;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.shipment.update({
        where: { id: order.id },
        data: updates,
      });
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

/**
 * DELETE /:id — Delete order
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const order = await prisma.shipment.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!order) {
      res.status(404).json({ detail: 'Order not found' });
      return;
    }

    // Delete related records first
    await prisma.shipmentStatusHistory.deleteMany({ where: { shipmentId: order.id } });
    await prisma.shipmentItem.deleteMany({ where: { shipmentId: order.id } });
    await prisma.shipment.delete({ where: { id: order.id } });

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

export default router;
