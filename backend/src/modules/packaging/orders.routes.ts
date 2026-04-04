import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

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

    // Sort
    const sortField = sortParam || '-createdAt';
    const desc = sortField.startsWith('-');
    const fieldName = desc ? sortField.slice(1) : sortField;
    // Map Python field names to Prisma
    const fieldMap: Record<string, string> = {
      allegro_created_at: 'createdAt',
      created_at: 'createdAt',
      total_amount: 'totalAmount',
      status: 'status',
    };
    const prismaField = fieldMap[fieldName] || fieldName;
    const orderBy: any = { [prismaField]: desc ? 'desc' : 'asc' };

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
      let customerName: string | null = null;
      let customerEmail: string | null = null;
      let customerPhone: string | null = null;

      if (o.customer) {
        const parts = [o.customer.firstName || '', o.customer.lastName || ''].filter(Boolean);
        customerName = parts.join(' ') || o.customer.login || o.customer.companyName || null;
        customerEmail = o.customer.email;
        customerPhone = o.customer.phone;
      }

      return {
        id: o.id,
        allegro_order_id: o.externalId || o.orderNumber,
        customer_id: o.customerId || null,
        status: o.status.toLowerCase(),
        payment_status: o.paymentStatus || 'pending',
        cod_amount: o.codAmount || null,
        is_cod: o.paymentStatus === 'cod',
        total_amount: o.totalAmount || 0,
        currency: o.currency || 'PLN',
        buyer_note: o.buyerNote || null,
        internal_note: o.internalNote || null,
        address_name: o.addressName || null,
        address_city: o.addressCity || null,
        address_phone: o.addressPhone || null,
        delivery_method: o.deliveryMethod || null,
        dispatch_deadline: o.dispatchDeadline ? o.dispatchDeadline.toISOString() : null,
        delivery_point_id: o.deliveryPointId || null,
        allegro_created_at: o.createdAt.toISOString(),
        paid_at: o.paidAt ? o.paidAt.toISOString() : null,
        shipped_at: o.shippedAt ? o.shippedAt.toISOString() : null,
        created_at: o.createdAt.toISOString(),
        items_count: o.items.length,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || o.addressPhone || null,
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
      allegro_order_id: order.externalId || order.orderNumber,
      status: order.status.toLowerCase(),
      payment_status: order.paymentStatus || 'pending',
      cod_amount: order.codAmount || null,
      is_cod: order.paymentStatus === 'cod',
      total_amount: order.totalAmount || 0,
      currency: order.currency || 'PLN',
      buyer_note: order.buyerNote || null,
      internal_note: order.internalNote || null,
      address_name: order.addressName || null,
      address_street: order.addressStreet || null,
      address_city: order.addressCity || null,
      address_zip: order.addressZip || null,
      address_phone: order.addressPhone || null,
      delivery_method: order.deliveryMethod || null,
      delivery_point_id: order.deliveryPointId || null,
      allegro_created_at: order.createdAt.toISOString(),
      paid_at: order.paidAt ? order.paidAt.toISOString() : null,
      shipped_at: order.shippedAt ? order.shippedAt.toISOString() : null,
      created_at: order.createdAt.toISOString(),
      customer_name: customerName,
      customer: customerData,
      items: order.items.map(i => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        total_price: i.totalPrice,
        allegro_offer_id: i.allegroOfferId,
        image_url: i.imageUrl,
      })),
      status_history: order.statusHistory.map(h => ({
        id: h.id,
        old_status: h.oldStatus,
        new_status: h.newStatus,
        note: h.note,
        created_at: h.createdAt.toISOString(),
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
    const { status, internal_note } = req.body;

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

    if (internal_note !== undefined) {
      updates.internalNote = internal_note;
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

export default router;
