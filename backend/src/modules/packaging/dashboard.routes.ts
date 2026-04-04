import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

/**
 * GET /stats — Dashboard stats: counts by status, revenue, orders today
 * Matches PakOps: GET /dashboard/stats
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      select: { status: true, totalAmount: true, paidAt: true, createdAt: true },
    });

    // Status counts (lowercase)
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
    let ordersToday = 0;

    for (const s of shipments) {
      const refDate = s.paidAt || s.createdAt;
      if (refDate >= todayStart) revenueToday += s.totalAmount || 0;
      if (refDate >= monthStart) revenueMonth += s.totalAmount || 0;
      if (s.createdAt >= todayStart) ordersToday++;
    }

    res.json({
      new: counts['new'] || 0,
      paid: counts['paid'] || 0,
      packing: counts['packing'] || 0,
      packed: counts['packed'] || 0,
      shipped: counts['shipped'] || 0,
      delivered: counts['delivered'] || 0,
      total: shipments.length,
      orders_today: ordersToday,
      revenue_today: revenueToday,
      revenue_month: revenueMonth,
    });
  } catch (err) { next(err); }
});

/**
 * GET /chart — Daily revenue and order count for last N days
 * Matches PakOps: GET /dashboard/chart
 */
router.get('/chart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const days = Math.min(90, Math.max(7, parseInt((req.query.days as string) || '30')));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId, createdAt: { gte: startDate } },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const daily: Record<string, { orders: number; revenue: number }> = {};
    for (const s of shipments) {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!daily[day]) daily[day] = { orders: 0, revenue: 0 };
      daily[day].orders++;
      daily[day].revenue += s.totalAmount || 0;
    }

    const result = Object.entries(daily)
      .map(([date, data]) => ({ date, orders: data.orders, revenue: data.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /top-products — Top selling products by quantity
 * Matches PakOps: GET /dashboard/top-products
 */
router.get('/top-products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '10')));

    const items = await prisma.shipmentItem.findMany({
      where: { shipment: { workspaceId } },
      select: { name: true, quantity: true, totalPrice: true },
    });

    const products: Record<string, { name: string; total_qty: number; total_revenue: number; order_count: number }> = {};
    for (const item of items) {
      const key = item.name;
      if (!products[key]) {
        products[key] = { name: item.name, total_qty: 0, total_revenue: 0, order_count: 0 };
      }
      products[key].total_qty += item.quantity;
      products[key].total_revenue += item.totalPrice || 0;
      products[key].order_count++;
    }

    const result = Object.values(products)
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, limit);

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /recent — Recent orders
 * Matches PakOps: GET /dashboard/recent
 */
router.get('/recent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '10')));

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(shipments.map(o => ({
      id: o.id,
      allegro_order_id: o.externalId || o.orderNumber,
      status: o.status.toLowerCase(),
      total_amount: o.totalAmount || 0,
      address_name: o.addressName || null,
      delivery_method: o.deliveryMethod || null,
      allegro_created_at: o.createdAt.toISOString(),
    })));
  } catch (err) { next(err); }
});

export default router;
