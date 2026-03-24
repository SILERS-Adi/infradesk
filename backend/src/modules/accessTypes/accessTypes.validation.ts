import { z } from 'zod';

export const createAccessTypeSchema = z.object({
  name:      z.string().min(1).max(100),
  slug:      z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/).optional(),
  icon:      z.string().optional(),
  color:     z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateAccessTypeSchema = createAccessTypeSchema.partial();

export type CreateAccessTypeInput = z.infer<typeof createAccessTypeSchema>;
export type UpdateAccessTypeInput = z.infer<typeof updateAccessTypeSchema>;
