import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

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

export default router;
