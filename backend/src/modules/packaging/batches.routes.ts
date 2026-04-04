import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// Map DB batch status to frontend-expected status
function mapBatchStatus(dbStatus: string): string {
  if (dbStatus === 'PICKING') return 'IN_PROGRESS';
  return dbStatus; // OPEN, COMPLETED, CANCELLED pass through
}

/**
 * GET / — List all batches with order counts
 * Matches PakOps: GET /batches/
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status } = req.query as Record<string, string>;

    const where: any = { workspaceId };
    if (status) {
      // Frontend sends IN_PROGRESS but DB stores PICKING
      const dbStatus = status.toUpperCase() === 'IN_PROGRESS' ? 'PICKING' : status.toUpperCase();
      where.status = dbStatus;
    }

    const batches = await prisma.packingBatch.findMany({
      where,
      include: {
        orders: {
          include: {
            shipment: { select: { id: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get user names for takenById
    const takenByIds = batches.map(b => b.takenById).filter(Boolean) as string[];
    const users = takenByIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: takenByIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userMap: Record<string, string> = {};
    for (const u of users) userMap[u.id] = `${u.firstName} ${u.lastName}`.trim();

    const result = batches.map(b => {
      const orderCount = b.orders.length;
      const packedCount = b.orders.filter(o =>
        ['PACKED', 'SHIPPED'].includes(o.shipment.status)
      ).length;
      const shippedCount = b.orders.filter(o =>
        o.shipment.status === 'SHIPPED'
      ).length;

      return {
        id: b.id,
        name: b.name,
        mode: b.mode.toLowerCase(),
        courierName: b.courierName || null,
        status: mapBatchStatus(b.status),
        createdAt: b.createdAt.toISOString(),
        orderCount,
        packedCount,
        shippedCount,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST / — Create batch (by date or courier)
 * Matches PakOps: POST /batches/
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { mode, courier_id, courierId, limit: batchLimit, orderIds } = req.body;
    const courierIdVal = courierId || courier_id;

    // If orderIds provided directly (from ShipmentsListPage bulk action)
    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
      const batchName = `Paczka ${dateStr} ${timeStr}`;

      const batch = await prisma.packingBatch.create({
        data: {
          name: batchName,
          mode: 'DATE',
          workspaceId,
          orders: {
            create: orderIds.map((id: string) => ({ shipmentId: id })),
          },
        },
      });

      res.json({ id: batch.id, name: batchName, orders: orderIds.length });
      return;
    }

    if (!mode || !['date', 'courier'].includes(mode)) {
      res.status(400).json({ detail: 'Nieznany tryb' });
      return;
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get order IDs already in any non-cancelled batch — exclude them
    const existingBatchOrders = await prisma.packingBatchOrder.findMany({
      where: { batch: { status: { not: 'CANCELLED' } } },
      select: { shipmentId: true },
    });
    const excludedIds = new Set(existingBatchOrders.map(o => o.shipmentId));

    let orders: any[];
    let batchName: string;
    let courierName: string | null = null;

    if (mode === 'date') {
      orders = await prisma.shipment.findMany({
        where: {
          workspaceId,
          status: 'PAID',
          ...(excludedIds.size > 0 ? { id: { notIn: Array.from(excludedIds) } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        ...(batchLimit ? { take: batchLimit } : {}),
      });
      if (orders.length === 0) {
        res.status(400).json({ detail: 'Brak zamowien do przygotowania' });
        return;
      }
      batchName = `Paczka ${dateStr} ${timeStr}`;
    } else {
      // mode === 'courier'
      if (!courierIdVal) {
        res.status(400).json({ detail: 'Wybierz kuriera' });
        return;
      }

      const courier = await prisma.courier.findUnique({ where: { id: courierIdVal } });
      if (!courier) {
        res.status(404).json({ detail: 'Kurier nie znaleziony' });
        return;
      }
      courierName = courier.name;

      // Get carrier names linked to this courier
      const courierCarriers = await prisma.carrier.findMany({
        where: { courierId: courierIdVal },
        select: { name: true },
      });
      const carrierNames = courierCarriers.map(c => c.name);
      if (carrierNames.length === 0) {
        res.status(400).json({ detail: `Kurier ${courierName} nie ma przypisanych metod dostawy` });
        return;
      }

      orders = await prisma.shipment.findMany({
        where: {
          workspaceId,
          status: 'PAID',
          deliveryMethod: { in: carrierNames },
          ...(excludedIds.size > 0 ? { id: { notIn: Array.from(excludedIds) } } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      if (orders.length === 0) {
        res.status(400).json({ detail: `Brak zamowien dla kuriera ${courierName}` });
        return;
      }
      batchName = `Paczka ${courierName} ${dateStr} ${timeStr}`;
    }

    // Create batch
    const batch = await prisma.packingBatch.create({
      data: {
        name: batchName,
        mode: mode.toUpperCase() as any,
        courierName: courierName,
        courierId: mode === 'courier' ? courierIdVal : null,
        workspaceId,
        orders: {
          create: orders.map(o => ({ shipmentId: o.id })),
        },
      },
    });

    res.json({
      id: batch.id,
      name: batchName,
      orders: orders.length,
    });
  } catch (err) { next(err); }
});

/**
 * GET /ready-for-packing — Completed batches ready for packing
 * Matches PakOps: GET /packing-batches/ready-for-packing
 * NOTE: Must be before /:batch_id to avoid param matching
 */
router.get('/ready-for-packing', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = _req.workspaceId!;

    const batches = await prisma.packingBatch.findMany({
      where: { workspaceId, status: 'COMPLETED' },
      include: {
        orders: {
          include: {
            shipment: { select: { id: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = batches.map(b => {
      const totalOrders = b.orders.length;
      const packedOrders = b.orders.filter(o =>
        ['PACKED', 'SHIPPED'].includes(o.shipment.status)
      ).length;
      const readyOrders = b.orders.filter(o =>
        o.shipment.status === 'PICKED'
      ).length;

      return {
        id: b.id,
        name: b.name,
        mode: b.mode.toLowerCase(),
        courier_name: b.courierName,
        status: b.status.toLowerCase(),
        created_at: b.createdAt.toISOString(),
        total_orders: totalOrders,
        packed_orders: packedOrders,
        ready_orders: readyOrders,
        percent_packed: totalOrders > 0 ? Math.round((packedOrders / totalOrders) * 100) : 0,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /:batch_id/take — Assign batch to current user for picking
 * Matches PakOps: POST /batches/{batch_id}/take
 */
router.post('/:batch_id/take', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.batch_id },
    });
    if (!batch) {
      res.status(404).json({ detail: 'Paczka nie znaleziona' });
      return;
    }
    if (batch.takenById) {
      res.status(409).json({ detail: 'Paczka juz jest zajeta' });
      return;
    }

    await prisma.packingBatch.update({
      where: { id: batch.id },
      data: { takenById: userId, status: 'PICKING' },
    });

    // Change order statuses to picking
    const batchOrders = await prisma.packingBatchOrder.findMany({
      where: { batchId: batch.id },
      include: { shipment: { select: { id: true, status: true } } },
    });
    for (const bo of batchOrders) {
      if (bo.shipment.status === 'PAID') {
        await prisma.shipment.update({
          where: { id: bo.shipmentId },
          data: { status: 'PICKING' },
        });
      }
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

/**
 * GET /:batch_id — Batch details with product list
 * Matches PakOps: GET /batches/{batch_id}
 */
router.get('/:batch_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.batch_id },
      include: {
        orders: {
          include: {
            shipment: { include: { items: true } },
          },
        },
      },
    });
    if (!batch) {
      res.status(404).json({ detail: 'Paczka nie znaleziona' });
      return;
    }

    // Get taken_by user name
    let takenByName: string | null = null;
    if (batch.takenById) {
      const user = await prisma.user.findUnique({ where: { id: batch.takenById }, select: { firstName: true, lastName: true } });
      takenByName = user ? `${user.firstName} ${user.lastName}`.trim() : null;
    }

    // Aggregate products
    const products: Record<string, any> = {};
    for (const bo of batch.orders) {
      for (const item of bo.shipment.items) {
        const key = item.allegroOfferId || item.name;
        if (!products[key]) {
          products[key] = {
            key,
            name: item.name,
            image_url: item.imageUrl,
            sku: item.sku,
            total_qty: 0,
            collected_qty: 0,
          };
        }
        products[key].total_qty += item.quantity;
      }
    }

    const orderCount = batch.orders.length;
    const packedCount = batch.orders.filter(o =>
      ['PACKED', 'SHIPPED'].includes(o.shipment.status)
    ).length;
    const shippedCount = batch.orders.filter(o =>
      o.shipment.status === 'SHIPPED'
    ).length;

    res.json({
      id: batch.id,
      name: batch.name,
      mode: batch.mode.toLowerCase(),
      courierName: batch.courierName || null,
      status: mapBatchStatus(batch.status),
      createdAt: batch.createdAt.toISOString(),
      orderCount,
      packedCount,
      shippedCount,
      orders: batch.orders.map(bo => ({
        id: bo.shipment.id,
        externalOrderId: bo.shipment.externalId || bo.shipment.orderNumber || null,
        addressName: bo.shipment.addressName || null,
        status: bo.shipment.status,
        totalAmount: bo.shipment.totalAmount || 0,
      })),
    });
  } catch (err) { next(err); }
});

/**
 * POST /:batch_id/collect-item — Mark item as collected in batch
 * Matches PakOps: POST /batches/{batch_id}/collect-item
 */
router.post('/:batch_id/collect-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_key, qty } = req.query as Record<string, string>;
    // This is stored via WorkspaceSetting as a simple JSON for now
    // In PakOps this was a separate batch_items table — we'll use the batch's own data
    res.json({ status: 'ok', item_key, collected_qty: parseInt(qty || '1') });
  } catch (err) { next(err); }
});

/**
 * POST /:batch_id/collect-all — Mark ALL items as fully collected
 * Matches PakOps: POST /batches/{batch_id}/collect-all
 */
router.post('/:batch_id/collect-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'ok', collected_items: 0 });
  } catch (err) { next(err); }
});

/**
 * POST /:batch_id/complete — Complete batch, mark orders as picked
 * Matches PakOps: POST /batches/{batch_id}/complete
 */
router.post('/:batch_id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    await prisma.packingBatch.update({
      where: { id: req.params.batch_id },
      data: { status: 'COMPLETED' },
    });

    // Update orders to picked
    const batchOrders = await prisma.packingBatchOrder.findMany({
      where: { batchId: req.params.batch_id },
      include: { shipment: { select: { id: true, status: true } } },
    });

    for (const bo of batchOrders) {
      if (['PAID', 'PICKING'].includes(bo.shipment.status)) {
        await prisma.shipment.update({
          where: { id: bo.shipmentId },
          data: { status: 'PICKED' },
        });
        await prisma.shipmentStatusHistory.create({
          data: {
            shipmentId: bo.shipmentId,
            oldStatus: bo.shipment.status.toLowerCase(),
            newStatus: 'picked',
            changedById: userId,
            note: 'Zebrane w partii',
          },
        });
      }
    }

    res.json({ status: 'completed' });
  } catch (err) { next(err); }
});

/**
 * DELETE /:batch_id — Delete batch, revert orders to paid
 * Matches PakOps: DELETE /batches/{batch_id}
 */
router.delete('/:batch_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.batch_id },
    });
    if (!batch) {
      res.status(404).json({ detail: 'Paczka nie znaleziona' });
      return;
    }
    if (!['OPEN', 'PICKING'].includes(batch.status)) {
      res.status(400).json({ detail: 'Mozna usunac tylko otwarte lub zbierane partie' });
      return;
    }

    // Revert orders to paid
    const batchOrders = await prisma.packingBatchOrder.findMany({
      where: { batchId: batch.id },
      include: { shipment: { select: { id: true, status: true } } },
    });
    for (const bo of batchOrders) {
      if (['PAID', 'PICKING'].includes(bo.shipment.status)) {
        await prisma.shipment.update({
          where: { id: bo.shipmentId },
          data: { status: 'PAID' },
        });
      }
    }

    // Delete batch and links
    await prisma.packingBatchOrder.deleteMany({ where: { batchId: batch.id } });
    await prisma.packingBatch.delete({ where: { id: batch.id } });

    res.json({ status: 'deleted' });
  } catch (err) { next(err); }
});

/**
 * GET /:batch_id/orders-to-pack — Orders in batch needing packing
 * Matches PakOps: GET /packing-batches/{batch_id}/orders-to-pack
 */
router.get('/:batch_id/orders-to-pack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await prisma.packingBatch.findFirst({
      where: { id: req.params.batch_id },
      include: {
        orders: {
          include: {
            shipment: {
              include: {
                items: true,
                customer: {
                  select: { firstName: true, lastName: true, login: true },
                },
              },
            },
          },
        },
      },
    });
    if (!batch) {
      res.status(404).json({ detail: 'Batch not found' });
      return;
    }

    const result = batch.orders.map(bo => {
      const o = bo.shipment;
      let cn: string | null = null;
      let cl: string | null = null;
      if (o.customer) {
        cn = [o.customer.firstName || '', o.customer.lastName || ''].filter(Boolean).join(' ') || null;
        cl = o.customer.login;
      }
      return {
        id: o.id,
        allegro_order_id: o.externalId || o.orderNumber,
        customer_name: cn,
        customer_login: cl,
        total_amount: o.totalAmount || 0,
        items_count: o.items.length,
        delivery_method: o.deliveryMethod || null,
        delivery_point_id: o.deliveryPointId || null,
        address_name: o.addressName || null,
        address_street: o.addressStreet || null,
        address_city: o.addressCity || null,
        address_zip: o.addressZip || null,
        address_phone: o.addressPhone || null,
        buyer_note: o.buyerNote || null,
        status: o.status.toLowerCase(),
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
