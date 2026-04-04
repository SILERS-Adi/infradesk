import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// Wave statuses
const WAVE_STATUSES: Record<string, string> = {
  waiting: 'Oczekuje na zbieranie',
  picking: 'Zbieranie w toku',
  ready: 'Gotowe do pakowania',
  packing: 'Pakowanie w toku',
  done: 'Gotowe na odbior',
  late: 'Opoznione',
};

function isPastPickup(pickupTime: string | null, now: Date): boolean {
  if (!pickupTime) return false;
  try {
    const [h, m] = pickupTime.split(':').map(Number);
    const plOffset = 2; // CEST hours
    const deadline = new Date(now);
    deadline.setUTCHours(h - plOffset, m, 0, 0);
    return now > deadline;
  } catch {
    return false;
  }
}

function computeWaveStatus(
  orders: Array<{ status: string; dispatchDeadline: Date | null }>,
  pickupTime: string | null,
  pastPickup: boolean,
  now: Date,
): string {
  const statuses = orders.map(o => o.status);
  const total = statuses.length;
  if (total === 0) return 'waiting';

  const packed = statuses.filter(s => s === 'PACKED' || s === 'SHIPPED').length;
  const picked = statuses.filter(s => s === 'PICKED').length;
  const packing = statuses.filter(s => s === 'PACKING').length;
  const picking = statuses.filter(s => s === 'PICKING').length;

  if (packed === total) return 'done';

  // After pickup: remaining unpacked orders are late
  if (pastPickup && (total - packed) > 0) return 'late';

  // Check dispatch_deadline
  const overdue = orders.some(o =>
    !['PACKED', 'SHIPPED'].includes(o.status) &&
    o.dispatchDeadline &&
    o.dispatchDeadline < now
  );
  if (overdue) return 'late';

  if (packing > 0) return 'packing';
  if (picked > 0 || (picked + packed) > 0) return 'ready';
  if (picking > 0) return 'picking';
  return 'waiting';
}

/**
 * GET /today — Today's shipping waves grouped by carrier
 * Matches PakOps: GET /waves/today
 */
router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    // Get all active orders (not shipped/delivered/cancelled)
    const orders = await prisma.shipment.findMany({
      where: {
        workspaceId,
        status: { in: ['PAID', 'PICKING', 'PICKED', 'PACKING', 'PACKED'] },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    // Get carrier -> courier mapping
    const carriersDb = await prisma.carrier.findMany({
      where: { workspaceId, isActive: true },
      include: { courier: { select: { id: true, name: true, pickupTime: true, logoUrl: true } } },
    });

    const carrierToCourier: Record<string, string> = {};
    const courierInfo: Record<string, { name: string; pickup_time: string | null; logo_url: string | null }> = {};

    for (const c of carriersDb) {
      const courierName = c.courier?.name || 'Inny';
      carrierToCourier[c.name] = courierName;
      if (!courierInfo[courierName]) {
        courierInfo[courierName] = {
          name: c.courier?.name || 'Inny',
          pickup_time: c.pickupTime || c.courier?.pickupTime || null,
          logo_url: c.courier?.logoUrl || null,
        };
      }
    }

    // Group by courier
    const waves: Record<string, { carrier: string; pickup_time: string | null; logo_url: string | null; orders: typeof orders }> = {};
    for (const order of orders) {
      const dm = order.deliveryMethod || 'Inny';
      const courierName = carrierToCourier[dm] || 'Inny';
      if (!waves[courierName]) {
        const info = courierInfo[courierName] || { name: courierName, pickup_time: null, logo_url: null };
        waves[courierName] = {
          carrier: info.name,
          pickup_time: info.pickup_time,
          logo_url: info.logo_url,
          orders: [],
        };
      }
      waves[courierName].orders.push(order);
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const waveCards: any[] = [];

    for (const [carrier, wave] of Object.entries(waves)) {
      const pickupTime = wave.pickup_time;
      const pastPickup = isPastPickup(pickupTime, now);

      let orderList = wave.orders;

      // After pickup: filter out already packed/shipped
      if (pastPickup) {
        orderList = orderList.filter(o => !['PACKED', 'SHIPPED'].includes(o.status));
        if (orderList.length === 0) continue;
      }

      const total = orderList.length;
      const statuses = orderList.map(o => o.status);
      const packed = statuses.filter(s => s === 'PACKED' || s === 'SHIPPED').length;
      const picked = statuses.filter(s => s === 'PICKED').length;
      const packingCount = statuses.filter(s => s === 'PACKING').length;
      const pickingCount = statuses.filter(s => s === 'PICKING').length;
      const waiting = statuses.filter(s => s === 'PAID').length;

      const waveStatus = computeWaveStatus(orderList, pickupTime, pastPickup, now);

      // Time remaining
      let timeRemaining: string | null = null;
      let minutesLeft: number | null = null;
      if (pickupTime) {
        try {
          const [h, m] = pickupTime.split(':').map(Number);
          const plOffset = 2;
          const deadline = new Date(now);
          deadline.setUTCHours(h - plOffset, m, 0, 0);
          const diff = (deadline.getTime() - now.getTime()) / 1000;
          minutesLeft = Math.max(0, Math.floor(diff / 60));
          if (diff > 0) {
            const hours = Math.floor(diff / 3600);
            const mins = Math.floor((diff % 3600) / 60);
            timeRemaining = hours > 0 ? `za ${hours}h ${String(mins).padStart(2, '0')}m` : `za ${mins}m`;
          } else if (pastPickup) {
            timeRemaining = 'PRZEKROCZONY';
          } else {
            timeRemaining = 'jutro';
          }
        } catch { /* ignore */ }
      }

      const percent = total > 0 ? Math.round((packed / total) * 100) : 0;

      waveCards.push({
        carrier,
        logo_url: wave.logo_url,
        pickup_time: pickupTime,
        time_remaining: timeRemaining,
        minutes_left: minutesLeft,
        date: today,
        status: waveStatus,
        status_label: WAVE_STATUSES[waveStatus] || waveStatus,
        total,
        packed,
        picked,
        packing: packingCount,
        picking: pickingCount,
        waiting,
        percent,
        past_pickup: pastPickup,
        order_ids: orderList.map(o => o.id),
        orders: orderList.map(o => ({
          id: o.id,
          allegro_order_id: o.externalId || o.orderNumber,
          customer_name: o.addressName || '\u2014',
          status: o.status.toLowerCase(),
          total_amount: o.totalAmount || 0,
          items_count: o.items.length,
          delivery_point_id: o.deliveryPointId || null,
        })),
      });
    }

    // Sort: late first, then by pickup_time, then by percent
    waveCards.sort((a, b) => {
      if (a.status === 'late' && b.status !== 'late') return -1;
      if (a.status !== 'late' && b.status === 'late') return 1;
      const timeA = a.pickup_time || '99:99';
      const timeB = b.pickup_time || '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return -a.percent + b.percent;
    });

    const totalOrders = waveCards.reduce((sum, w) => sum + w.total, 0);
    const totalPacked = waveCards.reduce((sum, w) => sum + w.packed, 0);

    res.json({
      waves: waveCards,
      summary: {
        total_waves: waveCards.length,
        total_orders: totalOrders,
        total_packed: totalPacked,
        total_percent: totalOrders > 0 ? Math.round((totalPacked / totalOrders) * 100) : 0,
      },
    });
  } catch (err) { next(err); }
});

/**
 * POST /:carrier/start-picking — Start picking for a wave (carrier group)
 * Matches PakOps: POST /waves/{carrier}/start-picking
 */
router.post('/:carrier/start-picking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const carrierName = req.params.carrier.replace(/__/g, ' ').replace(/_-_/g, ' - ').replace(/_/g, ' ');

    // Find matching orders
    let orders = await prisma.shipment.findMany({
      where: {
        workspaceId,
        deliveryMethod: { contains: carrierName, mode: 'insensitive' },
        status: 'PAID',
      },
      include: { items: true },
    });

    if (orders.length === 0) {
      // Try exact match
      orders = await prisma.shipment.findMany({
        where: { workspaceId, deliveryMethod: carrierName, status: 'PAID' },
        include: { items: true },
      });
    }

    if (orders.length === 0) {
      res.status(400).json({ detail: `Brak zamowien do zebrania dla: ${carrierName}` });
      return;
    }

    // Check no active picking session
    const existing = await prisma.pickingSession.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      res.status(409).json({ detail: 'Masz juz aktywna sesje zbierania' });
      return;
    }

    // Build items map
    const itemsToPick: Record<string, any> = {};
    const orderIds: string[] = [];
    for (const order of orders) {
      orderIds.push(order.id);
      await prisma.shipment.update({ where: { id: order.id }, data: { status: 'PICKING' } });
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: order.id,
          oldStatus: 'paid',
          newStatus: 'picking',
          changedById: userId,
          note: `Zbieranie fali ${carrierName}`,
        },
      });

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

    const session = await prisma.pickingSession.create({
      data: {
        userId,
        workspaceId,
        itemsToPick,
        orderIds,
      },
    });

    res.json({
      session_id: session.id,
      carrier: carrierName,
      orders: orderIds.length,
      products: Object.keys(itemsToPick).length,
    });
  } catch (err) { next(err); }
});

export default router;
