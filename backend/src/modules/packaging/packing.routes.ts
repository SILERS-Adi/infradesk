import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET /queue — Orders ready for packing ──────────────────────────
router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const shipments = await prisma.shipment.findMany({
      where: {
        workspaceId,
        status: { in: ['PENDING', 'PACKED'] },
        // PACKED from picking (PICKED → ready to pack) or PENDING with no picking required
      },
      include: {
        items: true,
        customer: { select: { id: true, firstName: true, lastName: true, login: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(shipments);
  } catch (err) { next(err); }
});

// ── POST /sessions — Start packing session ─────────────────────────
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { shipmentId } = req.body;

    if (!shipmentId) {
      res.status(400).json({ error: 'shipmentId is required' });
      return;
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: shipmentId, workspaceId },
      include: { items: true },
    });
    if (!shipment) {
      res.status(404).json({ error: 'Shipment not found' });
      return;
    }

    // Check no active session exists for this shipment
    const existing = await prisma.packingSession.findFirst({
      where: { shipmentId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      res.status(409).json({ error: 'An active packing session already exists for this shipment', sessionId: existing.id });
      return;
    }

    // Build initial itemsChecked map: { itemId: false }
    const itemsChecked: Record<string, boolean> = {};
    shipment.items.forEach(item => { itemsChecked[item.id] = false; });

    const [session] = await prisma.$transaction([
      prisma.packingSession.create({
        data: {
          shipmentId,
          userId,
          workspaceId,
          itemsChecked,
        },
      }),
      prisma.shipment.update({
        where: { id: shipmentId },
        data: { status: 'PACKING' },
      }),
    ]);

    res.status(201).json(session);
  } catch (err) { next(err); }
});

// ── GET /active — User's active packing session ────────────────────
router.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;

    const session = await prisma.packingSession.findFirst({
      where: { workspaceId, userId, status: 'IN_PROGRESS' },
      include: {
        shipment: { include: { items: true, customer: true } },
        photos: { select: { id: true, filename: true, createdAt: true } },
      },
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
    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        shipment: { include: { items: true, customer: true } },
        photos: { select: { id: true, filename: true, createdAt: true } },
      },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/scan — Scan barcode ─────────────────────────
router.post('/sessions/:id/scan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { barcode } = req.body;

    if (!barcode) {
      res.status(400).json({ error: 'barcode is required' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
      include: { shipment: { include: { items: true } } },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    // Try to match barcode against SKU or item name
    const matchedItem = session.shipment.items.find(
      item => item.sku === barcode || item.name === barcode
    );

    if (!matchedItem) {
      res.status(404).json({ error: 'No matching item found for barcode', barcode });
      return;
    }

    // Update itemsChecked
    const itemsChecked = (session.itemsChecked as Record<string, boolean>) || {};
    itemsChecked[matchedItem.id] = true;

    const updated = await prisma.packingSession.update({
      where: { id: session.id },
      data: { itemsChecked },
    });

    res.json({ matched: true, itemId: matchedItem.id, itemName: matchedItem.name, itemsChecked: updated.itemsChecked });
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/check-item — Manual check/uncheck ──────────
router.post('/sessions/:id/check-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { itemId, checked } = req.body;

    if (!itemId || typeof checked !== 'boolean') {
      res.status(400).json({ error: 'itemId and checked (boolean) are required' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const itemsChecked = (session.itemsChecked as Record<string, boolean>) || {};
    itemsChecked[itemId] = checked;

    const updated = await prisma.packingSession.update({
      where: { id: session.id },
      data: { itemsChecked },
    });

    res.json({ itemsChecked: updated.itemsChecked });
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/photo — Upload photo (base64) ──────────────
router.post('/sessions/:id/photo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { base64, filename } = req.body;

    if (!base64) {
      res.status(400).json({ error: 'base64 image data is required' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    const photo = await prisma.packingPhoto.create({
      data: {
        sessionId: session.id,
        filename: filename || `pack-${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        data: buffer,
      },
    });

    res.status(201).json({ id: photo.id, filename: photo.filename, createdAt: photo.createdAt });
  } catch (err) { next(err); }
});

// ── GET /sessions/:id/photos/:photoId — Get photo ──────────────────
router.get('/sessions/:id/photos/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    // Verify session belongs to workspace
    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const photo = await prisma.packingPhoto.findFirst({
      where: { id: req.params.photoId, sessionId: session.id },
    });
    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${photo.filename}"`);
    res.send(photo.data);
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/complete — Complete packing ─────────────────
router.post('/sessions/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const [updatedSession] = await prisma.$transaction([
      prisma.packingSession.update({
        where: { id: session.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      prisma.shipment.update({
        where: { id: session.shipmentId },
        data: { status: 'PACKED' },
      }),
      prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: session.shipmentId,
          oldStatus: 'PACKING',
          newStatus: 'PACKED',
          changedById: req.user!.userId,
          note: 'Packing session completed',
        },
      }),
    ]);

    res.json(updatedSession);
  } catch (err) { next(err); }
});

// ── POST /sessions/:id/cancel — Cancel session ────────────────────
router.post('/sessions/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.id, workspaceId, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ error: 'Active session not found' });
      return;
    }

    const [updatedSession] = await prisma.$transaction([
      prisma.packingSession.update({
        where: { id: session.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      }),
      prisma.shipment.update({
        where: { id: session.shipmentId },
        data: { status: 'PENDING' },
      }),
      prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: session.shipmentId,
          oldStatus: 'PACKING',
          newStatus: 'PENDING',
          changedById: req.user!.userId,
          note: 'Packing session cancelled',
        },
      }),
    ]);

    res.json(updatedSession);
  } catch (err) { next(err); }
});

export default router;
