import { z } from 'zod';

export const createPaymentSchema = z.object({
  documentId: z.string().min(1),
  amount: z.number().min(0.01),
  paidAt: z.string().optional(),
  method: z.string().default('przelew'),
  notes: z.string().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
