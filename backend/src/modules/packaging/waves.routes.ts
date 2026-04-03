import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET /today — Today's waves grouped by courier + pickup time ────
router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get today's shipped/packed shipments with courier info
    const shipments = await prisma.shipment.findMany({
      where: {
        workspaceId,
        status: { in: ['PACKED', 'SHIPPED'] },
        updatedAt: { gte: todayStart, lte: todayEnd },
      },
      include: {
        items: { select: { id: true, name: true, quantity: true } },
      },
      orderBy: { courier: 'asc' },
    });

    // Get couriers with pickup times
    const couriers = await prisma.courier.findMany({
      where: { workspaceId, isActive: true },
      include: { carriers: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });

    // Build courier lookup by name (shipment.courier stores the courier name)
    const courierMap: Record<string, { pickupTime: string | null; courierName: string }> = {};
    for (const c of couriers) {
      courierMap[c.name.toLowerCase()] = { pickupTime: c.pickupTime, courierName: c.name };
      for (const carrier of c.carriers) {
        courierMap[carrier.name.toLowerCase()] = { pickupTime: carrier.pickupTime || c.pickupTime, courierName: c.name };
        if (carrier.code) {
          courierMap[carrier.code.toLowerCase()] = { pickupTime: carrier.pickupTime || c.pickupTime, courierName: c.name };
        }
      }
    }

    // Group shipments into waves by courier + pickup time
    const waves: Record<string, {
      courier: string;
      pickupTime: string | null;
      shipments: typeof shipments;
      count: number;
      packedCount: number;
      shippedCount: number;
    }> = {};

    for (const shipment of shipments) {
      const courierKey = shipment.courier.toLowerCase();
      const info = courierMap[courierKey] || { pickupTime: null, courierName: shipment.courier };
      const waveKey = `${info.courierName}__${info.pickupTime || 'no-time'}`;

      if (!waves[waveKey]) {
        waves[waveKey] = {
          courier: info.courierName,
          pickupTime: info.pickupTime,
          shipments: [],
          count: 0,
          packedCount: 0,
          shippedCount: 0,
        };
      }

      waves[waveKey].shipments.push(shipment);
      waves[waveKey].count++;
      if (shipment.status === 'PACKED') waves[waveKey].packedCount++;
      if (shipment.status === 'SHIPPED') waves[waveKey].shippedCount++;
    }

    // Sort by pickup time
    const result = Object.values(waves).sort((a, b) => {
      if (!a.pickupTime) return 1;
      if (!b.pickupTime) return -1;
      return a.pickupTime.localeCompare(b.pickupTime);
    });

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
