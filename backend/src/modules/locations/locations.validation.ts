import { z } from 'zod';

export const createLocationSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.string().optional().default('Biuro'),
  addressLine1: z.string().optional().default('-'),
  addressLine2: z.string().optional().nullable(),
  postalCode: z.string().optional().default(''),
  city: z.string().optional().default(''),
  country: z.string().default('PL'),
  contactPersonName: z.string().optional().nullable(),
  contactPersonPhone: z.string().optional().nullable(),
  contactPersonEmail: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const updateLocationSchema = createLocationSchema.omit({ clientId: true }).partial();

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
