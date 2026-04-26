import { z } from 'zod';

export const createDelegationSchema = z.object({
  assignedToUserId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  scheduledAt: z.string().optional(),
});

export const updateDelegationSchema = createDelegationSchema.partial();
export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;
export type UpdateDelegationInput = z.infer<typeof updateDelegationSchema>;
