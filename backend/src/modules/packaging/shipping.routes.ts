import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

/**
 * GET /shipment-info/:orderId — Shipping requirements for an order
 * Returns carrier info, logo, size options (if applicable), requires_weight flag
 * Used by PackingStationPage to display shipment form
 */
router.get('/shipment-info/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.orderId, workspaceId },
      select: {
        id: true,
        deliveryMethod: true,
        deliveryPointId: true,
        addressName: true,
        addressStreet: true,
        addressCity: true,
        addressZip: true,
        totalWeight: true,
      },
    });
    if (!shipment) {
      res.status(404).json({ detail: 'Zamówienie nie znalezione' });
      return;
    }

    // Match deliveryMethod → Carrier → Courier to get logo and pickup info
    let carrierLogo: string | null = null;
    let carrierName: string | null = shipment.deliveryMethod || null;
    let pickupTime: string | null = null;
    let requiresWeight = true;
    let sizeOptions: any[] | null = null;

    if (shipment.deliveryMethod) {
      const carrier = await prisma.carrier.findFirst({
        where: { workspaceId, name: shipment.deliveryMethod, isActive: true },
        include: { courier: true },
      });

      if (carrier?.courier) {
        carrierLogo = carrier.courier.logoUrl || null;
        carrierName = carrier.courier.name;
        pickupTime = carrier.pickupTime || carrier.courier.pickupTime || null;
      }

      // InPost Paczkomat size options
      const dm = shipment.deliveryMethod.toLowerCase();
      if (dm.includes('inpost') || dm.includes('paczkomat')) {
        sizeOptions = [
          { value: 'small', label: 'A', desc: '8×38×64 cm' },
          { value: 'medium', label: 'B', desc: '19×38×64 cm' },
          { value: 'large', label: 'C', desc: '41×38×64 cm' },
        ];
        requiresWeight = true;
      }
    }

    res.json({
      order_id: shipment.id,
      carrier_name: carrierName,
      carrier_logo: carrierLogo,
      delivery_point_id: shipment.deliveryPointId || null,
      pickup_time: pickupTime,
      address: {
        name: shipment.addressName,
        street: shipment.addressStreet,
        city: shipment.addressCity,
        zip: shipment.addressZip,
      },
      size_options: sizeOptions,
      requires_weight: requiresWeight,
      current_weight: shipment.totalWeight || null,
    });
  } catch (err) { next(err); }
});

/**
 * POST /create-shipment — Local shipment creation (no courier API)
 * Updates Shipment status to PACKED, records dimensions, generates local waybill ID.
 * Does NOT contact external courier API — real integration = Etap C.
 * Does NOT set shippedAt (no real dispatch happened).
 */
router.post('/create-shipment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!.userId;
    const { order_id, length, width, height, weight } = req.body;

    if (!order_id) {
      res.status(400).json({ detail: 'order_id jest wymagane' });
      return;
    }

    const shipment = await prisma.shipment.findFirst({
      where: { id: order_id, workspaceId },
    });
    if (!shipment) {
      res.status(404).json({ detail: 'Zamówienie nie znalezione' });
      return;
    }

    if (shipment.status === 'PACKED' || shipment.status === 'SHIPPED') {
      res.status(409).json({ detail: 'Zamówienie jest już spakowane lub wysłane' });
      return;
    }

    const waybill = `WB-${Date.now()}`;
    const weightGrams = Math.round((weight || 1) * 1000);
    const dims = `${length || 30}×${width || 20}×${height || 15} cm, ${weight || 1.0} kg`;
    const oldStatus = shipment.status.toLowerCase();

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'PACKED',
        trackingNumber: waybill,
        totalWeight: weightGrams,
        notes: shipment.notes
          ? `${shipment.notes}\nWymiary: ${dims}`
          : `Wymiary: ${dims}`,
      },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        oldStatus,
        newStatus: 'packed',
        changedById: userId,
        note: `Przesyłka utworzona lokalnie (${dims})`,
      },
    });

    res.json({
      shipment_id: shipment.id,
      waybill,
    });
  } catch (err) { next(err); }
});

/**
 * POST /label — Download shipping label PDF
 * Currently returns 501 — real label generation requires courier API integration (Etap C).
 */
router.post('/label', async (_req: Request, res: Response) => {
  res.status(501).json({
    detail: 'Generowanie etykiet wymaga integracji z API kuriera. Nadaj przesyłkę ręcznie przez panel kuriera.',
  });
});

export default router;
