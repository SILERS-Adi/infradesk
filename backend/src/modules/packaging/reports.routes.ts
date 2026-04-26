import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

/**
 * GET /summary — Summary report for date range
 * Matches PakOps: GET /reports/summary
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { date_from, date_to } = req.query as Record<string, string>;

    if (!date_from || !date_to) {
      res.status(400).json({ detail: 'date_from and date_to are required (YYYY-MM-DD)' });
      return;
    }

    const dateFrom = new Date(date_from);
    const dateTo = new Date(date_to);
    dateTo.setDate(dateTo.getDate() + 1); // Include full day

    // Get all orders in range
    const orders = await prisma.shipment.findMany({
      where: {
        workspaceId,
        createdAt: { gte: dateFrom, lt: dateTo },
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        customerId: true,
        deliveryMethod: true,
        createdAt: true,
      },
    });

    // Aggregate
    let totalRevenue = 0;
    let completedCount = 0;
    let completedRevenue = 0;
    let cancelledCount = 0;
    let cancelledRevenue = 0;
    let inProgressCount = 0;
    let inProgressRevenue = 0;
    let returnedCount = 0;
    let returnedRevenue = 0;
    let totalAmount = 0;
    const uniqueCustomers = new Set<string>();
    const statusBreakdown: Record<string, { count: number; revenue: number }> = {};
    const deliveryBreakdown: Record<string, { count: number; revenue: number }> = {};
    const dailyBreakdown: Record<string, { count: number; revenue: number }> = {};

    for (const o of orders) {
      const amt = o.totalAmount || 0;
      totalRevenue += amt;
      totalAmount += amt;

      if (o.customerId) uniqueCustomers.add(o.customerId);

      const statusLower = o.status.toLowerCase();
      if (!statusBreakdown[statusLower]) statusBreakdown[statusLower] = { count: 0, revenue: 0 };
      statusBreakdown[statusLower].count++;
      statusBreakdown[statusLower].revenue += amt;

      if (['PACKED', 'SHIPPED', 'DELIVERED'].includes(o.status)) {
        completedCount++;
        completedRevenue += amt;
      } else if (o.status === 'CANCELLED') {
        cancelledCount++;
        cancelledRevenue += amt;
      } else if (['PAID', 'PICKING', 'PICKED', 'PACKING'].includes(o.status)) {
        inProgressCount++;
        inProgressRevenue += amt;
      } else if (o.status === 'RETURNED') {
        returnedCount++;
        returnedRevenue += amt;
      }

      const dm = o.deliveryMethod || 'Inny';
      if (!deliveryBreakdown[dm]) deliveryBreakdown[dm] = { count: 0, revenue: 0 };
      deliveryBreakdown[dm].count++;
      deliveryBreakdown[dm].revenue += amt;

      const day = o.createdAt.toISOString().slice(0, 10);
      if (!dailyBreakdown[day]) dailyBreakdown[day] = { count: 0, revenue: 0 };
      dailyBreakdown[day].count++;
      dailyBreakdown[day].revenue += amt;
    }

    // Top products
    const items = await prisma.shipmentItem.findMany({
      where: {
        shipment: {
          workspaceId,
          createdAt: { gte: dateFrom, lt: dateTo },
        },
      },
      select: { name: true, quantity: true, totalPrice: true },
    });

    const productAgg: Record<string, { quantity: number; revenue: number }> = {};
    for (const i of items) {
      if (!productAgg[i.name]) productAgg[i.name] = { quantity: 0, revenue: 0 };
      productAgg[i.name].quantity += i.quantity;
      productAgg[i.name].revenue += i.totalPrice || 0;
    }

    const topProducts = Object.entries(productAgg)
      .map(([name, d]) => ({ name, quantity: d.quantity, revenue: d.revenue }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const statuses = Object.entries(statusBreakdown)
      .map(([status, d]) => ({ status, count: d.count, revenue: d.revenue }))
      .sort((a, b) => b.count - a.count);

    const deliveryMethods = Object.entries(deliveryBreakdown)
      .map(([method, d]) => ({ method, count: d.count, revenue: d.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const daily = Object.entries(dailyBreakdown)
      .map(([date, d]) => ({ date, count: d.count, revenue: d.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgOrderValue = orders.length > 0 ? totalAmount / orders.length : 0;

    res.json({
      date_from,
      date_to,
      total_orders: orders.length,
      total_revenue: totalRevenue,
      completed: completedCount,
      completed_revenue: completedRevenue,
      cancelled: cancelledCount,
      cancelled_revenue: cancelledRevenue,
      in_progress: inProgressCount,
      in_progress_revenue: inProgressRevenue,
      returned: returnedCount,
      returned_revenue: returnedRevenue,
      avg_order_value: avgOrderValue,
      unique_customers: uniqueCustomers.size,
      statuses,
      delivery_methods: deliveryMethods,
      daily,
      top_products: topProducts,
    });
  } catch (err) { next(err); }
});

export default router;
