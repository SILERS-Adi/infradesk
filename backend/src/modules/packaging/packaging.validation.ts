import { z } from 'zod';

export const createShipmentSchema = z.object({
  orderNumber: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  status: z.enum(['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'ERROR', 'CANCELLED']).default('PENDING'),
  courier: z.string().default('inpost'),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    weight: z.number().int().min(0).default(0),
  })).default([]),
});

export const updateShipmentSchema = createShipmentSchema.partial();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
