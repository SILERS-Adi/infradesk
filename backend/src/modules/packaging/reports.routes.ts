import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      select: { id: true, status: true, courier: true, totalWeight: true, createdAt: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const total = shipments.length;
    const totalWeight = shipments.reduce((s, sh) => s + sh.totalWeight, 0);
    const totalItems = shipments.reduce((s, sh) => s + sh._count.items, 0);

    // By status
    const byStatus: Record<string, number> = {};
    shipments.forEach(s => { const k = s.status.toLowerCase(); byStatus[k] = (byStatus[k] || 0) + 1; });

    // By courier
    const byCourier: Record<string, { count: number; weight: number }> = {};
    shipments.forEach(s => {
      if (!byCourier[s.courier]) byCourier[s.courier] = { count: 0, weight: 0 };
      byCourier[s.courier].count++;
      byCourier[s.courier].weight += s.totalWeight;
    });

    // Daily (last 30 days)
    const daily: Record<string, number> = {};
    shipments.forEach(s => {
      const day = s.createdAt.toISOString().slice(0, 10);
      daily[day] = (daily[day] || 0) + 1;
    });
    const dailyStats = Object.entries(daily).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const topCouriers = Object.entries(byCourier)
      .map(([courier, v]) => ({ courier, ...v }))
      .sort((a, b) => b.count - a.count);

    res.json({
      total,
      totalWeight,
      totalItems,
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byCourier: topCouriers,
      dailyStats,
    });
  } catch (err) { next(err); }
});

export default router;
