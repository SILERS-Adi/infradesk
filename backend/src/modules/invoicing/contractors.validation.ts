import { z } from 'zod';

export const createContractorSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  nip: z.string().optional(),
  regon: z.string().optional(),
  krs: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  corrStreet: z.string().optional(),
  corrPostalCode: z.string().optional(),
  corrCity: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  logoUrl: z.string().optional(),
  defaultPaymentDays: z.string().optional(),
  notes: z.string().optional(),
});

export const updateContractorSchema = createContractorSchema.partial();

export type CreateContractorInput = z.infer<typeof createContractorSchema>;
export type UpdateContractorInput = z.infer<typeof updateContractorSchema>;
