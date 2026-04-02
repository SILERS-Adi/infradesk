import { z } from 'zod';

export const createVehicleSchema = z.object({
  plate: z.string().min(1),
  vin: z.string().optional(),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().optional(),
  ownerName: z.string().min(1),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().optional(),
  notes: z.string().optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
