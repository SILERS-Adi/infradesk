import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

/**
 * GET /queue — Orders ready for packing (status=paid or picked)
 * Matches PakOps: GET /packing/queue
 */
router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const shipments = await prisma.shipment.findMany({
      where: {
        workspaceId,
        status: { in: ['PAID', 'PICKED'] },
      },
      include: {
        items: true,
        customer: {
          select: { id: true, firstName: true, lastName: true, login: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get active packing sessions to mark taken orders
    const activeSessions = await prisma.packingSession.findMany({
      where: { workspaceId, status: 'IN_PROGRESS' },
    });
    const sessionByShipment: Record<string, typeof activeSessions[0]> = {};
    for (const s of activeSessions) {
      sessionByShipment[s.shipmentId] = s;
    }

    // Get user names for active sessions
    const userIds = activeSessions.map(s => s.userId);
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userMap: Record<string, string> = {};
    for (const u of users) userMap[u.id] = `${u.firstName} ${u.lastName}`.trim();

    const items = shipments.map(o => {
      const session = sessionByShipment[o.id];
      let customerName: string | null = null;
      let customerLogin: string | null = null;
      if (o.customer) {
        const parts = [o.customer.firstName || '', o.customer.lastName || ''].filter(Boolean);
        customerName = parts.join(' ') || o.customer.login || null;
        customerLogin = o.customer.login;
      }

      return {
        id: o.id,
        allegro_order_id: o.externalId || o.orderNumber,
        status: o.status.toLowerCase(),
        customer_name: customerName,
        customer_login: customerLogin,
        total_amount: o.totalAmount || 0,
        items_count: o.items.length,
        delivery_method: o.deliveryMethod || null,
        delivery_point_id: o.deliveryPointId || null,
        dispatch_deadline: o.dispatchDeadline ? o.dispatchDeadline.toISOString() : null,
        allegro_created_at: o.createdAt.toISOString(),
        taken_by: session ? {
          id: session.userId,
          name: userMap[session.userId] || null,
        } : null,
        session_id: session ? session.id : null,
      };
    });

    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});

/**
 * POST /sessions — Start packing session
 * Matches PakOps: POST /packing/sessions
 */
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { order_id } = req.body;

    if (!order_id) {
      res.status(400).json({ detail: 'order_id is required' });
      return;
    }

    const order = await prisma.shipment.findFirst({
      where: { id: order_id, workspaceId },
      include: { items: true },
    });
    if (!order) {
      res.status(404).json({ detail: 'Order not found' });
      return;
    }
    if (!['PAID', 'PICKED', 'PACKING'].includes(order.status)) {
      res.status(400).json({ detail: `Order status is ${order.status.toLowerCase()}, cannot pack` });
      return;
    }

    // Check for existing active session — resume
    const existing = await prisma.packingSession.findFirst({
      where: { shipmentId: order_id, status: 'IN_PROGRESS' },
    });
    if (existing) {
      res.json({
        session_id: existing.id,
        order_id: order_id,
        items: existing.itemsChecked,
        resumed: true,
      });
      return;
    }

    // Build items_checked map: { itemId: { name, quantity, allegro_offer_id, image_url, scanned, qty_scanned } }
    const itemsChecked: Record<string, any> = {};
    for (const item of order.items) {
      itemsChecked[item.id] = {
        name: item.name,
        quantity: item.quantity,
        allegro_offer_id: item.allegroOfferId,
        image_url: item.imageUrl,
        scanned: false,
        qty_scanned: 0,
      };
    }

    const session = await prisma.packingSession.create({
      data: {
        shipmentId: order_id,
        userId,
        workspaceId,
        itemsChecked,
      },
    });

    // Update order status to packing
    if (['PAID', 'PICKED'].includes(order.status)) {
      await prisma.shipment.update({
        where: { id: order.id },
        data: { status: 'PACKING' },
      });
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: order.id,
          oldStatus: order.status.toLowerCase(),
          newStatus: 'packing',
          changedById: userId,
          note: `Pakowanie rozpoczete`,
        },
      });
    }

    res.json({
      session_id: session.id,
      order_id: order.id,
      items: itemsChecked,
    });
  } catch (err) { next(err); }
});

/**
 * GET /sessions/:session_id — Session details with order
 * Matches PakOps: GET /packing/sessions/{session_id}
 */
router.get('/sessions/:session_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id, workspaceId },
      include: {
        shipment: {
          include: {
            items: true,
            customer: true,
          },
        },
        photos: { select: { id: true, filename: true, createdAt: true } },
      },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    // Get packer name
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true },
    });
    const packerName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown';

    const order = session.shipment;
    let customerName: string | null = null;
    let customerLogin: string | null = null;
    if (order.customer) {
      const parts = [order.customer.firstName || '', order.customer.lastName || ''].filter(Boolean);
      customerName = parts.join(' ') || order.customer.login || null;
      customerLogin = order.customer.login;
    }

    res.json({
      id: session.id,
      status: session.status.toLowerCase(),
      started_at: session.startedAt.toISOString(),
      completed_at: session.completedAt ? session.completedAt.toISOString() : null,
      packer: packerName,
      notes: session.notes,
      items_checked: session.itemsChecked,
      photos_count: session.photos.length,
      order: {
        id: order.id,
        allegro_order_id: order.externalId || order.orderNumber,
        customer_name: customerName,
        customer_login: customerLogin,
        total_amount: order.totalAmount || 0,
        delivery_method: order.deliveryMethod || null,
        delivery_point_id: order.deliveryPointId || null,
        address_name: order.addressName || null,
        address_street: order.addressStreet || null,
        address_city: order.addressCity || null,
        address_zip: order.addressZip || null,
        address_phone: order.addressPhone || null,
        customer_email: order.customer?.email || null,
        buyer_note: order.buyerNote || null,
        is_cod: order.paymentStatus === 'cod',
        delivery_cost: order.deliveryCost || null,
        wants_invoice: order.wantsInvoice || false,
        invoice_company: order.invoiceCompany || null,
        invoice_nip: order.invoiceNip || null,
        invoice_address: order.invoiceAddress || null,
        cod_amount: order.codAmount || null,
        allegro_created_at: order.createdAt.toISOString(),
        items: order.items.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          allegro_offer_id: i.allegroOfferId,
          sku: i.sku,
          unit_price: i.unitPrice,
          image_url: i.imageUrl,
        })),
      },
    });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/scan — Scan barcode
 * Matches PakOps: POST /packing/sessions/{session_id}/scan
 */
router.post('/sessions/:session_id/scan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      res.status(400).json({ detail: 'barcode is required' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found or completed' });
      return;
    }

    const items = (session.itemsChecked as Record<string, any>) || {};
    const barcodeClean = barcode.trim();

    // Try to match barcode to an item by allegro_offer_id or name fragment
    let matchedItemId: string | null = null;
    for (const [itemId, itemData] of Object.entries(items)) {
      if (
        itemData.allegro_offer_id === barcodeClean ||
        (itemData.name && barcodeClean.toLowerCase().includes(itemData.name.toLowerCase().substring(0, 10)))
      ) {
        if ((itemData.qty_scanned || 0) < itemData.quantity) {
          matchedItemId = itemId;
          break;
        }
      }
    }

    if (!matchedItemId) {
      res.json({ matched: false, message: `Nie znaleziono produktu dla kodu: ${barcodeClean}` });
      return;
    }

    // Update scan count
    items[matchedItemId].qty_scanned = (items[matchedItemId].qty_scanned || 0) + 1;
    if (items[matchedItemId].qty_scanned >= items[matchedItemId].quantity) {
      items[matchedItemId].scanned = true;
    }

    await prisma.packingSession.update({
      where: { id: session.id },
      data: { itemsChecked: items },
    });

    const allScanned = Object.values(items).every((i: any) => i.scanned);

    res.json({
      matched: true,
      item_id: matchedItemId,
      item_name: items[matchedItemId].name,
      qty_scanned: items[matchedItemId].qty_scanned,
      qty_needed: items[matchedItemId].quantity,
      all_scanned: allScanned,
    });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/check-item — Manual check/uncheck
 * Matches PakOps: POST /packing/sessions/{session_id}/check-item
 */
router.post('/sessions/:session_id/check-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_id } = req.query as Record<string, string>;
    if (!item_id) {
      res.status(400).json({ detail: 'item_id query param required' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const items = (session.itemsChecked as Record<string, any>) || {};
    if (!items[item_id]) {
      res.status(404).json({ detail: 'Item not in session' });
      return;
    }

    // Toggle
    items[item_id].scanned = !items[item_id].scanned;
    items[item_id].qty_scanned = items[item_id].scanned ? items[item_id].quantity : 0;

    await prisma.packingSession.update({
      where: { id: session.id },
      data: { itemsChecked: items },
    });

    res.json({ item_id, scanned: items[item_id].scanned });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/photo — Add photo (base64)
 * Matches PakOps: POST /packing/sessions/{session_id}/photo
 */
router.post('/sessions/:session_id/photo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { photo_base64, filename } = req.body;
    if (!photo_base64) {
      res.status(400).json({ detail: 'Invalid base64 data' });
      return;
    }

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    let photoData: Buffer;
    try {
      photoData = Buffer.from(photo_base64, 'base64');
    } catch {
      res.status(400).json({ detail: 'Invalid base64 data' });
      return;
    }

    const photo = await prisma.packingPhoto.create({
      data: {
        sessionId: session.id,
        filename: filename || `paczka_${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        data: photoData,
      },
    });

    res.json({ photo_id: photo.id, filename: photo.filename });
  } catch (err) { next(err); }
});

/**
 * GET /sessions/:session_id/photos/:photo_id — Get photo binary
 * Matches PakOps: GET /packing/sessions/{session_id}/photos/{photo_id}
 */
router.get('/sessions/:session_id/photos/:photo_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const photo = await prisma.packingPhoto.findFirst({
      where: { id: req.params.photo_id, sessionId: req.params.session_id },
    });
    if (!photo) {
      res.status(404).json({ detail: 'Photo not found' });
      return;
    }

    res.setHeader('Content-Type', photo.contentType);
    res.send(photo.data);
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/complete — Complete packing
 * Matches PakOps: POST /packing/sessions/{session_id}/complete
 */
router.post('/sessions/:session_id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { notes } = req.body;

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
      include: { shipment: true },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found or already completed' });
      return;
    }

    const oldStatus = session.shipment.status.toLowerCase();

    await prisma.$transaction([
      prisma.packingSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          ...(notes && { notes }),
        },
      }),
      prisma.shipment.update({
        where: { id: session.shipmentId },
        data: { status: 'PACKED' },
      }),
      prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: session.shipmentId,
          oldStatus,
          newStatus: 'packed',
          changedById: userId,
          note: 'Spakowane',
        },
      }),
    ]);

    res.json({ status: 'completed', order_status: 'packed' });
  } catch (err) { next(err); }
});

/**
 * POST /sessions/:session_id/cancel — Cancel packing session
 * Matches PakOps: POST /packing/sessions/{session_id}/cancel
 */
router.post('/sessions/:session_id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const session = await prisma.packingSession.findFirst({
      where: { id: req.params.session_id, status: 'IN_PROGRESS' },
      include: { shipment: true },
    });
    if (!session) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    await prisma.packingSession.update({
      where: { id: session.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    if (session.shipment.status === 'PACKING') {
      await prisma.shipment.update({
        where: { id: session.shipmentId },
        data: { status: 'PAID' },
      });
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: session.shipmentId,
          oldStatus: 'packing',
          newStatus: 'paid',
          changedById: userId,
          note: 'Pakowanie anulowane',
        },
      });
    }

    res.json({ status: 'cancelled' });
  } catch (err) { next(err); }
});

/**
 * GET /active — Current user's active packing session
 * Matches PakOps: GET /packing/active
 */
router.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;

    const session = await prisma.packingSession.findFirst({
      where: { workspaceId, userId, status: 'IN_PROGRESS' },
    });

    if (!session) {
      res.json({ active: false });
      return;
    }

    res.json({
      active: true,
      session_id: session.id,
      order_id: session.shipmentId,
    });
  } catch (err) { next(err); }
});

/**
 * GET /next-ready — Next order ready for packing
 * Matches PakOps: GET /packing/next-ready
 */
router.get('/next-ready', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    // First try picked orders
    let order = await prisma.shipment.findFirst({
      where: { workspaceId, status: 'PICKED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    });
    if (order) {
      res.json({ order_id: order.id, status: 'picked' });
      return;
    }

    // Then paid orders
    order = await prisma.shipment.findFirst({
      where: { workspaceId, status: 'PAID' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    });
    if (order) {
      res.json({ order_id: order.id, status: 'paid' });
      return;
    }

    res.json({ order_id: null, status: 'empty' });
  } catch (err) { next(err); }
});

export default router;
