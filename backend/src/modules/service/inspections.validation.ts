import { z } from 'zod';

export const createInspectionSchema = z.object({
  vehicleId: z.string().min(1),
  inspectionNumber: z.string().min(1),
  type: z.enum(['PERIODIC', 'TECHNICAL', 'GAS_INSTALLATION', 'ADR', 'TAXI', 'OTHER']).default('PERIODIC'),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
  result: z.enum(['POSITIVE', 'NEGATIVE', 'CONDITIONAL']).optional(),
  scheduledAt: z.string(),
  completedAt: z.string().optional(),
  technicianName: z.string().optional(),
  notes: z.string().optional(),
  mileage: z.number().int().optional(),
});

export const updateInspectionSchema = createInspectionSchema.partial();
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>;
