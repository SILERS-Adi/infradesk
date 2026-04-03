import { z } from 'zod';

export const createOrderSchema = z.object({
  externalOrderId: z.string().optional(),
  status: z.enum(['NEW', 'PAID', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).default('NEW'),
  paymentStatus: z.string().default('pending'),
  totalAmount: z.number().default(0),
  buyerNote: z.string().optional(),
  internalNote: z.string().optional(),
  addressName: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressZip: z.string().optional(),
  addressPhone: z.string().optional(),
  deliveryMethod: z.string().optional(),
  deliveryPointId: z.string().optional(),
  courierName: z.string().optional(),
  trackingNumber: z.string().optional(),
  dispatchDeadline: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    unitPrice: z.number().default(0),
    imageUrl: z.string().optional(),
  })).default([]),
});

export const updateOrderSchema = createOrderSchema.partial();
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
