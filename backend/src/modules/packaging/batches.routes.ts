import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET / — List batches ───────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status } = req.query as Record<string, string>;

    const where: any = { workspaceId };
    if (status) where.status = status;

    const batches = await prisma.packingBatch.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(batches);
  } catch (err) { next(err); }
});

// ── POST / — Create batch ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, mode, courierName, courierId, shipmentIds } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!mode || !['DATE', 'COURIER'].includes(mode)) {
      res.status(400).json({ error: 'mode must be DATE or COURIER' });
      return;
    }

    // Validate shipmentIds if provided
    let validShipmentIds: string[] = [];
    if (shipmentIds && Array.isArray(shipmentIds) && shipmentIds.length > 0) {
      const shipments = await prisma.shipment.findMany({
        where: { id: { in: shipmentIds }, workspaceId },
        select: { id: true },
      });
      validShipmentIds = shipments.map(s => s.id);
    }

    const batch = await prisma.packingBatch.create({
      data: {
        name,
        mode,
        courierName: courierName || null,
        courierId: courierId || null,
        workspaceId,
        orders: validShipmentIds.length > 0
          ? {
              create: validShipmentIds.map(shipmentId => ({ shipmentId })),
            }
          : undefined,
      },
      include: {
        orders: { include: { shipment: { select: { id: true, orderNumber: true, status: true, courier: true } } } },
      },
    });

    res.status(201).json(batch);
  } catch (err) { next(err); }
});

// ── GET /ready-for-packing — Completed batches ready for packing ───
router.get('/ready-for-packing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const batches = await prisma.packingBatch.findMany({
      where: {
        workspaceId,
        status: { in: ['PACKED', 'READY'] },
      },
      include: {
        orders: {
          include: {
            shipment: {
              select: { id: true, orderNumber: true, status: true, customerName: true, courier: true },
            },
          },
        },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(batches);
  } catch (err) { next(err); }
});

// ── GET /:id — Batch details ──────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        orders: {
          include: {
            shipment: {
              include: { items: true, customer: true },
            },
          },
        },
      },
    });

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    res.json(batch);
  } catch (err) { next(err); }
});

// ── POST /:id/take — Assign batch to user ─────────────────────────
router.post('/:id/take', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;

    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.id, workspaceId },
    });

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    if (batch.takenById && batch.takenById !== userId) {
      res.status(409).json({ error: 'Batch already taken by another user' });
      return;
    }

    const updated = await prisma.packingBatch.update({
      where: { id: batch.id },
      data: { takenById: userId },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── GET /:id/orders-to-pack — Shipments in batch needing packing ──
router.get('/:id/orders-to-pack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        orders: {
          include: {
            shipment: {
              include: { items: true, customer: true },
            },
          },
        },
      },
    });

    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    // Filter to shipments that still need packing (not yet PACKED or SHIPPED)
    const ordersToPack = batch.orders.filter(
      o => !['PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.shipment.status)
    );

    res.json(ordersToPack);
  } catch (err) { next(err); }
});

export default router;
