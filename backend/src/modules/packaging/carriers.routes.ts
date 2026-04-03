import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET /couriers — List couriers ──────────────────────────────────
router.get('/couriers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const couriers = await prisma.courier.findMany({
      where: { workspaceId },
      include: {
        carriers: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(couriers);
  } catch (err) { next(err); }
});

// ── POST /couriers — Create courier ────────────────────────────────
router.post('/couriers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, logoUrl, pickupTime, worksSaturday } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const courier = await prisma.courier.create({
      data: {
        name,
        logoUrl: logoUrl || null,
        pickupTime: pickupTime || null,
        worksSaturday: worksSaturday ?? false,
        workspaceId,
      },
    });

    res.status(201).json(courier);
  } catch (err) { next(err); }
});

// ── PATCH /couriers/:id — Update courier ───────────────────────────
router.patch('/couriers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, logoUrl, pickupTime, worksSaturday, isActive } = req.body;

    const courier = await prisma.courier.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!courier) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    const updated = await prisma.courier.update({
      where: { id: courier.id },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(pickupTime !== undefined && { pickupTime }),
        ...(worksSaturday !== undefined && { worksSaturday }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── DELETE /couriers/:id — Delete courier ──────────────────────────
router.delete('/couriers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const courier = await prisma.courier.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!courier) {
      res.status(404).json({ error: 'Courier not found' });
      return;
    }

    await prisma.courier.delete({ where: { id: courier.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── GET / — List carriers ──────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const carriers = await prisma.carrier.findMany({
      where: { workspaceId },
      include: {
        courier: { select: { id: true, name: true, logoUrl: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json(carriers);
  } catch (err) { next(err); }
});

// ── PATCH /:id — Update carrier ────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, code, pickupTime, isActive, sortOrder, courierId } = req.body;

    const carrier = await prisma.carrier.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!carrier) {
      res.status(404).json({ error: 'Carrier not found' });
      return;
    }

    const updated = await prisma.carrier.update({
      where: { id: carrier.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(pickupTime !== undefined && { pickupTime }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(courierId !== undefined && { courierId }),
      },
      include: {
        courier: { select: { id: true, name: true, logoUrl: true } },
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── GET /client-config — Get shipping config ───────────────────────
router.get('/client-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const setting = await prisma.workspaceSetting.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'pakops_shipping_config' } },
    });

    res.json(setting ? JSON.parse(setting.value) : {});
  } catch (err) { next(err); }
});

// ── PUT /client-config — Save shipping config ──────────────────────
router.put('/client-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const config = req.body;

    await prisma.workspaceSetting.upsert({
      where: { workspaceId_key: { workspaceId, key: 'pakops_shipping_config' } },
      create: { workspaceId, key: 'pakops_shipping_config', value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
