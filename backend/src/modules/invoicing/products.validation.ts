import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  ean: z.string().optional(),
  pkwiu: z.string().optional(),
  productType: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default('szt'),
  priceNet: z.number().min(0).default(0),
  vatRate: z.string().default('23'),
  imageUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProductSchema = createProductSchema.partial();
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
