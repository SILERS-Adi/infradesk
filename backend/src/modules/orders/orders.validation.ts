import { z } from 'zod';

export const orderItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().optional(),
  quantity: z.number().int().min(1).default(1),
  link: z.string().optional(),
  addToInventory: z.boolean().default(false),
});

export const createOrderSchema = z.object({
  ticketId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
});

export const changeOrderStatusSchema = z.object({
  status: z.enum(['NEW', 'PENDING_APPROVAL', 'IN_PROGRESS', 'INSTALLED', 'CANCELLED']),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>;
