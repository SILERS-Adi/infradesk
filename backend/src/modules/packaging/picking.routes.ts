import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

/**
 * GET /list — Aggregated product list from all paid/picking orders
 * Matches PakOps: GET /picking/list
 */
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const orders = await prisma.shipment.findMany({
      where: { workspaceId, status: { in: ['PAID', 'PICKING'] } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    // Get carrier pickup times
    const carriers = await prisma.carrier.findMany({
      where: { workspaceId, isActive: true },
      select: { name: true, pickupTime: true },
    });
    const carrierTimes: Record<string, string | null> = {};
    for (const c of carriers) carrierTimes[c.name] = c.pickupTime;

    // Group items by allegro_offer_id (or by name if none)
    const products: Record<string, any> = {};
    const carriersOrders: Record<string, any> = {};

    for (const order of orders) {
      const dm = order.deliveryMethod || 'Inny';

      if (!carriersOrders[dm]) {
        carriersOrders[dm] = {
          carrier: dm,
          pickup_time: carrierTimes[dm] || null,
          orders: [],
        };
      }
      carriersOrders[dm].orders.push({
        id: order.id,
        allegro_order_id: (order.externalId || order.orderNumber || '').substring(0, 10),
        items_count: order.items.length,
        total_amount: order.totalAmount || 0,
        allegro_created_at: order.createdAt.toISOString(),
      });

      for (const item of order.items) {
        const key = item.allegroOfferId || item.name;
        if (!products[key]) {
          products[key] = {
            key,
            offer_id: item.allegroOfferId,
            name: item.name,
            image_url: item.imageUrl,
            sku: item.sku,
            total_qty: 0,
            order_ids: [],
            order_snippets: [],
            carriers: [],
          };
        }
        products[key].total_qty += item.quantity;
        if (!products[key].order_ids.includes(order.id)) {
          products[key].order_ids.push(order.id);
          products[key].order_snippets.push((order.externalId || order.orderNumber || '').substring(0, 8));
        }
        if (!products[key].carriers.includes(dm)) {
          products[key].carriers.push(dm);
        }
      }
    }

    const items = Object.values(products).sort((a: any, b: any) => a.name.localeCompare(b.name));

    // Sort carriers by pickup_time (earliest first, null last)
    const sortedCarriers = Object.values(carriersOrders).sort((a: any, b: any) =>
      (a.pickup_time || '99:99').localeCompare(b.pickup_time || '99:99')
    );

    res.json({
      items,
      total_products: items.length,
      total_orders: orders.length,
      total_pieces: items.reduce((sum: number, p: any) => sum + p.total_qty, 0),
      by_carrier: sortedCarriers,
    });
  } catch (err) { next(err); }
});

/**
 * POST /start — Start picking session, lock all paid orders
 * Matches PakOps: POST /picking/start
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;

    // Check no active session
    const existing = await prisma.pickingSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      res.status(409).json({ detail: 'Already have active picking session' });
      return;
    }

    // Get all paid orders
    const orders = await prisma.shipment.findMany({
      where: { workspaceId, status: 'PAID' },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    if (orders.length === 0) {
      res.status(400).json({ detail: 'No orders to pick' });
      return;
    }

    // Build items map
    const itemsToPick: Record<string, any> = {};
    const orderIds: string[] = [];
    for (const order of orders) {
      orderIds.push(order.id);
      for (const item of order.items) {
        const key = item.allegroOfferId || item.name;
        if (!itemsToPick[key]) {
          itemsToPick[key] = {
            name: item.name,
            image_url: item.imageUrl,
            sku: item.sku,
            total_qty: 0,
            picked_qty: 0,
            order_ids: [],
          };
        }
        itemsToPick[key].total_qty += item.quantity;
        if (!itemsToPick[key].order_ids.includes(order.id)) {
          itemsToPick[key].order_ids.push(order.id);
        }
      }
    }

    // Create session and update order statuses
    const session = await prisma.pickingSession.create({
      data: {
        userId,
        workspaceId,
        itemsToPick,
        orderIds,
      },
    });

    // Change statuses to picking
    for (const order of orders) {
      await prisma.shipment.update({
        where: { id: order.id },
        data: { status: 'PICKING' },
      });
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: order.id,
          oldStatus: 'paid',
          newStatus: 'picking',
          changedById: userId,
          note: 'Zbieranie rozpoczete',
        },
      });
    }

    res.json({
      session_id: session.id,
      items: itemsToPick,
      order_count: orderIds.length,
    });
  } catch (err) { next(err); }
});

/**
 * GET /sessions/active — User's active picking session
 * Matches PakOps: GET /picking/sessions/active
 */
router.get('/sessions/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const session = await prisma.pickingSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.json({ active: false });
      return;
    }
    res.json({
      active: true,
      session_id: session.id,
      items: session.itemsToPick,
      order_count: ((session.orderIds as string[]) || []).length,
    });
  } catch (err) { next(err); }
});

/**
 * GET /sessions/:session_id — Session details
 * Matches PakOps: GET /picking/sessions/{session_id}
 */
router.get('/sessions/:session_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.session_id },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true },
    });

    res.json({
      id: session.id,
      status: session.status.toLowerCase(),
      picker: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
      items: session.itemsToPick,
      order_count: ((session.orderIds as string[]) || []).length,
      started_at: session.startedAt.toISOString(),
    });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/pick-item — Mark product as picked
 * Matches PakOps: POST /picking/sessions/{session_id}/pick-item
 */
router.post('/sessions/:session_id/pick-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { offer_id, qty } = req.body;
    if (!offer_id) {
      res.status(400).json({ detail: 'offer_id is required' });
      return;
    }

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const items = (session.itemsToPick as Record<string, any>) || {};
    let key = offer_id;

    if (!items[key]) {
      // Try matching by name substring or offer_id
      for (const [k, v] of Object.entries(items)) {
        if (offer_id.includes(k) || offer_id.toLowerCase().includes((v.name || '').toLowerCase().substring(0, 10))) {
          key = k;
          break;
        }
      }
      if (!items[key]) {
        res.status(404).json({ detail: 'Product not found in picking list' });
        return;
      }
    }

    items[key].picked_qty = Math.min(
      items[key].total_qty,
      (items[key].picked_qty || 0) + (qty || 1)
    );

    await prisma.pickingSession.update({
      where: { id: session.id },
      data: { itemsToPick: items },
    });

    res.json({
      key,
      name: items[key].name,
      picked_qty: items[key].picked_qty,
      total_qty: items[key].total_qty,
      done: items[key].picked_qty >= items[key].total_qty,
    });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/unpick-item — Decrease picked qty
 * Matches PakOps: POST /picking/sessions/{session_id}/unpick-item
 */
router.post('/sessions/:session_id/unpick-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { offer_id, qty } = req.body;
    if (!offer_id) {
      res.status(400).json({ detail: 'offer_id is required' });
      return;
    }

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const items = (session.itemsToPick as Record<string, any>) || {};
    if (!items[offer_id]) {
      res.status(404).json({ detail: 'Product not found' });
      return;
    }

    items[offer_id].picked_qty = Math.max(0, (items[offer_id].picked_qty || 0) - (qty || 1));

    await prisma.pickingSession.update({
      where: { id: session.id },
      data: { itemsToPick: items },
    });

    res.json({ key: offer_id, picked_qty: items[offer_id].picked_qty });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/complete — Complete picking, mark orders as picked
 * Matches PakOps: POST /picking/sessions/{session_id}/complete
 */
router.post('/sessions/:session_id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    await prisma.pickingSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const orderIds = (session.orderIds as string[]) || [];
    for (const oid of orderIds) {
      const order = await prisma.shipment.findUnique({ where: { id: oid } });
      if (order && order.status === 'PICKING') {
        await prisma.shipment.update({
          where: { id: oid },
          data: { status: 'PICKED' },
        });
        await prisma.shipmentStatusHistory.create({
          data: {
            shipmentId: oid,
            oldStatus: 'picking',
            newStatus: 'picked',
            changedById: userId,
            note: 'Towar zebrany',
          },
        });
      }
    }

    res.json({ status: 'completed', orders_updated: orderIds.length });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/cancel — Cancel picking, revert to paid
 * Matches PakOps: POST /picking/sessions/{session_id}/cancel
 */
router.post('/sessions/:session_id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    await prisma.pickingSession.update({
      where: { id: session.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    const orderIds = (session.orderIds as string[]) || [];
    for (const oid of orderIds) {
      const order = await prisma.shipment.findUnique({ where: { id: oid } });
      if (order && order.status === 'PICKING') {
        await prisma.shipment.update({
          where: { id: oid },
          data: { status: 'PAID' },
        });
        await prisma.shipmentStatusHistory.create({
          data: {
            shipmentId: oid,
            oldStatus: 'picking',
            newStatus: 'paid',
            changedById: userId,
            note: 'Zbieranie anulowane',
          },
        });
      }
    }

    res.json({ status: 'cancelled' });
  } catch (err) { next(err); }
});

export default router;
