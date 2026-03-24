import { z } from 'zod';

export const createLocationSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional().nullable(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: z.string().default('PL'),
  contactPersonName: z.string().optional().nullable(),
  contactPersonPhone: z.string().optional().nullable(),
  contactPersonEmail: z.string().email().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateLocationSchema = createLocationSchema.omit({ clientId: true }).partial();

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
