import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

// ═══ COURIERS (Kurierzy) ═══

/**
 * GET /couriers — List couriers with pending order counts
 * Matches PakOps: GET /carriers/couriers
 */
router.get('/couriers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const couriers = await prisma.courier.findMany({
      where: { workspaceId },
      include: {
        carriers: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get IDs of orders already in non-cancelled batches
    const batchedOrders = await prisma.packingBatchOrder.findMany({
      where: { batch: { status: { not: 'CANCELLED' } } },
      select: { shipmentId: true },
    });
    const batchedIds = new Set(batchedOrders.map(o => o.shipmentId));

    // Count pending orders per courier
    const result = await Promise.all(couriers.map(async (k) => {
      const carrierNames = k.carriers.map(c => c.name);
      let pendingOrders = 0;
      if (carrierNames.length > 0) {
        const count = await prisma.shipment.count({
          where: {
            workspaceId,
            status: 'PAID',
            deliveryMethod: { in: carrierNames },
            ...(batchedIds.size > 0 ? { id: { notIn: Array.from(batchedIds) } } : {}),
          },
        });
        pendingOrders = count;
      }

      return {
        id: k.id,
        name: k.name,
        logo_url: k.logoUrl,
        pickup_time: k.pickupTime,
        works_saturday: k.worksSaturday,
        is_active: k.isActive,
        pending_orders: pendingOrders,
      };
    }));

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /couriers — Create courier
 * Matches PakOps: POST /carriers/couriers
 */
router.post('/couriers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, pickup_time, works_saturday, logo_base64 } = req.body;

    let logoUrl: string | null = null;
    if (logo_base64) {
      logoUrl = logo_base64.startsWith('data:') ? logo_base64 : `data:image/png;base64,${logo_base64}`;
    }

    const courier = await prisma.courier.create({
      data: {
        name,
        pickupTime: pickup_time || null,
        worksSaturday: works_saturday ?? false,
        logoUrl,
        workspaceId,
      },
    });

    res.json({ status: 'ok', id: courier.id });
  } catch (err) { next(err); }
});

/**
 * PATCH /couriers/:courier_id — Update courier
 * Matches PakOps: PATCH /carriers/couriers/{courier_id}
 */
router.patch('/couriers/:courier_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, pickup_time, works_saturday, logo_base64 } = req.body;

    const courier = await prisma.courier.findFirst({
      where: { id: req.params.courier_id, workspaceId },
    });
    if (!courier) {
      res.status(404).json({ detail: 'Courier not found' });
      return;
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (pickup_time !== undefined) updates.pickupTime = pickup_time || null;
    if (works_saturday !== undefined) updates.worksSaturday = works_saturday;
    if (logo_base64 !== undefined) {
      if (logo_base64 && !logo_base64.startsWith('data:')) {
        updates.logoUrl = `data:image/png;base64,${logo_base64}`;
      } else {
        updates.logoUrl = logo_base64 || null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.courier.update({ where: { id: courier.id }, data: updates });
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

/**
 * DELETE /couriers/:courier_id — Delete courier
 * Matches PakOps: DELETE /carriers/couriers/{courier_id}
 */
router.delete('/couriers/:courier_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const courier = await prisma.courier.findFirst({
      where: { id: req.params.courier_id, workspaceId },
    });
    if (!courier) {
      res.status(404).json({ detail: 'Courier not found' });
      return;
    }

    // Unlink carriers first
    await prisma.carrier.updateMany({
      where: { courierId: courier.id },
      data: { courierId: null },
    });
    await prisma.courier.delete({ where: { id: courier.id } });

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// ═══ CARRIERS (Allegro delivery methods) ═══

/**
 * GET / — List carriers
 * Matches PakOps: GET /carriers/
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const carriers = await prisma.carrier.findMany({
      where: { workspaceId },
      include: {
        courier: {
          select: { id: true, name: true, pickupTime: true, logoUrl: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const result = carriers.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      pickup_time: c.pickupTime || c.courier?.pickupTime || null,
      is_active: c.isActive,
      sort_order: c.sortOrder,
      courier_id: c.courierId || null,
      courier_name: c.courier?.name || null,
      courier_pickup_time: c.courier?.pickupTime || null,
      courier_logo: c.courier?.logoUrl || null,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * PATCH /:carrier_id — Update carrier
 * Matches PakOps: PATCH /carriers/{carrier_id}
 */
router.patch('/:carrier_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { courier_id, pickup_time } = req.body;

    const carrier = await prisma.carrier.findFirst({
      where: { id: req.params.carrier_id, workspaceId },
    });
    if (!carrier) {
      res.status(404).json({ detail: 'Carrier not found' });
      return;
    }

    const updates: any = {};
    if (courier_id !== undefined) {
      updates.courierId = (courier_id === '' || courier_id === 'null') ? null : courier_id;
    }
    if (pickup_time !== undefined) {
      updates.pickupTime = pickup_time || null;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.carrier.update({ where: { id: carrier.id }, data: updates });
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

// ═══ CLIENT CONFIG ═══

/**
 * GET /client-config — Get shipping config
 * Matches PakOps: GET /carriers/client-config
 */
router.get('/client-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const prefix = `t:${workspaceId}:`;

    // Try workspace-specific settings
    const settings = await prisma.workspaceSetting.findMany({
      where: {
        workspaceId,
        key: { startsWith: 'pakops_' },
      },
      orderBy: { key: 'asc' },
    });

    if (settings.length > 0) {
      res.json(settings.map(s => ({
        key: s.key.replace('pakops_', ''),
        value: s.key.includes('token') ? '........' : s.value,
      })));
      return;
    }

    // Fallback: empty
    res.json([]);
  } catch (err) { next(err); }
});

/**
 * PUT /client-config — Update shipping config
 * Matches PakOps: PUT /carriers/client-config
 */
router.put('/client-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { key, value } = req.body;

    const allowed = ['sender_', 'package_', 'inpost_', 'allegro_'];
    if (!allowed.some(p => key.startsWith(p))) {
      res.status(400).json({ detail: 'Niedozwolony klucz' });
      return;
    }

    const settingKey = `pakops_${key}`;
    await prisma.workspaceSetting.upsert({
      where: { workspaceId_key: { workspaceId, key: settingKey } },
      create: { workspaceId, key: settingKey, value },
      update: { value },
    });

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

export default router;
