import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET /stats — Counts by status, revenue today/month ─────────────
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [shipments, todayShipments, monthShipments] = await prisma.$transaction([
      prisma.shipment.findMany({
        where: { workspaceId },
        select: { status: true },
      }),
      prisma.shipment.findMany({
        where: { workspaceId, createdAt: { gte: todayStart } },
        select: { totalAmount: true, status: true },
      }),
      prisma.shipment.findMany({
        where: { workspaceId, createdAt: { gte: monthStart } },
        select: { totalAmount: true, status: true },
      }),
    ]);

    // Counts by status
    const byStatus: Record<string, number> = {};
    shipments.forEach(s => {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    });

    // Revenue
    const revenueToday = todayShipments.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const revenueMonth = monthShipments.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    res.json({
      total: shipments.length,
      byStatus,
      ordersToday: todayShipments.length,
      ordersMonth: monthShipments.length,
      revenueToday,
      revenueMonth,
    });
  } catch (err) { next(err); }
});

// ── GET /chart — Daily revenue & order count ───────────────────────
router.get('/chart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const days = parseInt((req.query.days as string) || '30');
    const since = new Date();
    since.setDate(since.getDate() - days);

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const daily: Record<string, { count: number; revenue: number }> = {};
    shipments.forEach(s => {
      const day = s.createdAt.toISOString().slice(0, 10);
      if (!daily[day]) daily[day] = { count: 0, revenue: 0 };
      daily[day].count++;
      daily[day].revenue += s.totalAmount || 0;
    });

    const chart = Object.entries(daily)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json(chart);
  } catch (err) { next(err); }
});

// ── GET /top-products — Top products by quantity ───────────────────
router.get('/top-products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = parseInt((req.query.limit as string) || '20');

    const items = await prisma.shipmentItem.findMany({
      where: { shipment: { workspaceId } },
      select: { name: true, sku: true, quantity: true },
    });

    // Aggregate by SKU/name
    const products: Record<string, { name: string; sku: string | null; totalQty: number; orderCount: number }> = {};
    items.forEach(item => {
      const key = item.sku || item.name;
      if (!products[key]) {
        products[key] = { name: item.name, sku: item.sku, totalQty: 0, orderCount: 0 };
      }
      products[key].totalQty += item.quantity;
      products[key].orderCount++;
    });

    const topProducts = Object.values(products)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, limit);

    res.json(topProducts);
  } catch (err) { next(err); }
});

// ── GET /recent — Recent shipments ─────────────────────────────────
router.get('/recent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = parseInt((req.query.limit as string) || '20');

    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      include: {
        items: { select: { id: true, name: true, quantity: true } },
        customer: { select: { id: true, firstName: true, lastName: true, login: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(shipments);
  } catch (err) { next(err); }
});

export default router;
