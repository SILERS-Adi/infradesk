import { z } from 'zod';

export const createContractorSchema = z.object({
  name: z.string().min(1),
  nip: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updateContractorSchema = createContractorSchema.partial();

export type CreateContractorInput = z.infer<typeof createContractorSchema>;
export type UpdateContractorInput = z.infer<typeof updateContractorSchema>;
