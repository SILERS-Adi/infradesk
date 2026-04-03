import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET /list — Aggregated product picking list from PAID orders ───
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const orders = await prisma.packingOrder.findMany({
      where: { workspaceId, status: 'PAID' },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate items by SKU/name
    const aggregated: Record<string, { name: string; sku: string | null; totalQty: number; orderIds: string[] }> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.sku || item.name;
        if (!aggregated[key]) {
          aggregated[key] = { name: item.name, sku: item.sku, totalQty: 0, orderIds: [] };
        }
        aggregated[key].totalQty += item.quantity;
        if (!aggregated[key].orderIds.includes(order.id)) {
          aggregated[key].orderIds.push(order.id);
        }
      }
    }

    const pickingList = Object.values(aggregated).sort((a, b) => b.totalQty - a.totalQty);

    res.json({ orderCount: orders.length, items: pickingList });
  } catch (err) { next(err); }
});

// ── POST /start — Start picking session ────────────────────────────
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { orderIds } = req.body;

    // Check user doesn't have an active session
    const activeSession = await prisma.pickingSession.findFirst({
      where: { workspaceId, userId, status: 'IN_PROGRESS' },
    });
    if (activeSession) {
      res.status(409).json({ error: 'You already have an active picking session', sessionId: activeSession.id });
      return;
    }

    // Get PAID orders to pick (either specified or all)
    const whereClause: any = { workspaceId, status: 'PAID' };
    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      whereClause.id = { in: orderIds };
    }

    const orders = await prisma.packingOrder.findMany({
      where: whereClause,
      include: { items: true },
    });

    if (orders.length === 0) {
      res.status(400).json({ error: 'No PAID orders available for picking' });
      return;
    }

    // Build aggregated items to pick
    const itemsToPick: Record<string, { name: string; sku: string | null; totalQty: number; pickedQty: number }> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = item.sku || item.name;
        if (!itemsToPick[key]) {
          itemsToPick[key] = { name: item.name, sku: item.sku, totalQty: 0, pickedQty: 0 };
        }
        itemsToPick[key].totalQty += item.quantity;
      }
    }

    const selectedOrderIds = orders.map(o => o.id);

    const [session] = await prisma.$transaction([
      prisma.pickingSession.create({
        data: {
          userId,
          workspaceId,
          itemsToPick,
          orderIds: selectedOrderIds,
        },
      }),
      // Mark orders as PICKING
      ...orders.map(order =>
        prisma.packingOrder.update({
          where: { id: order.id },
          data: { status: 'PICKING' },
        })
      ),
    ]);

    res.status(201).json(session);
  } catch (err) { next(err); }
});

// ── GET /sessions/active — User's active picking session ───────────
router.get('/sessions/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;

    const session = await prisma.pickingSession.findFirst({
      where: { workspaceId, userId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      res.json(null);
      return;
    }
    res.json(session);
  } catch (err) { next(err); }
});

// ── GET /sessions/:id — Session details ────────────────────────────
router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/pick-item — Mark product picked ─────────────
router.post('/sessions/:id/pick-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { key, qty } = req.body;

    if (!key) {
      res.status(400).json({ error: 'key (sku or name) is required' });
      return;
    }

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const itemsToPick = (session.itemsToPick as Record<string, { name: string; sku: string | null; totalQty: number; pickedQty: number }>) || {};
    if (!itemsToPick[key]) {
      res.status(404).json({ error: 'Item not found in picking list' });
      return;
    }

    const increment = qty && typeof qty === 'number' ? qty : 1;
    itemsToPick[key].pickedQty = Math.min(
      itemsToPick[key].pickedQty + increment,
      itemsToPick[key].totalQty
    );

    const updated = await prisma.pickingSession.update({
      where: { id: session.id },
      data: { itemsToPick },
    });

    res.json({ itemsToPick: updated.itemsToPick });
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/unpick-item — Decrease picked qty ───────────
router.post('/sessions/:id/unpick-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { key, qty } = req.body;

    if (!key) {
      res.status(400).json({ error: 'key (sku or name) is required' });
      return;
    }

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const itemsToPick = (session.itemsToPick as Record<string, { name: string; sku: string | null; totalQty: number; pickedQty: number }>) || {};
    if (!itemsToPick[key]) {
      res.status(404).json({ error: 'Item not found in picking list' });
      return;
    }

    const decrement = qty && typeof qty === 'number' ? qty : 1;
    itemsToPick[key].pickedQty = Math.max(itemsToPick[key].pickedQty - decrement, 0);

    const updated = await prisma.pickingSession.update({
      where: { id: session.id },
      data: { itemsToPick },
    });

    res.json({ itemsToPick: updated.itemsToPick });
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/complete — Complete picking ─────────────────
router.post('/sessions/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const orderIds = (session.orderIds as string[]) || [];

    const [updatedSession] = await prisma.$transaction([
      prisma.pickingSession.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      // Mark orders as PICKED
      ...orderIds.map(orderId =>
        prisma.packingOrder.update({
          where: { id: orderId },
          data: { status: 'PICKED' },
        })
      ),
    ]);

    res.json(updatedSession);
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/cancel — Cancel picking ────────────────────
router.post('/sessions/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.pickingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const orderIds = (session.orderIds as string[]) || [];

    const [updatedSession] = await prisma.$transaction([
      prisma.pickingSession.update({
        where: { id: session.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      }),
      // Revert orders to PAID
      ...orderIds.map(orderId =>
        prisma.packingOrder.update({
          where: { id: orderId },
          data: { status: 'PAID' },
        })
      ),
    ]);

    res.json(updatedSession);
  } catch (err) { next(err); }
});

export default router;
