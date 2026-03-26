import { z } from 'zod';

export const createClientSchema = z.object({
  clientType:   z.enum(['COMPANY', 'INDIVIDUAL']).default('COMPANY'),
  name:         z.string().min(1).max(200),
  firstName:    z.string().optional().nullable(),
  lastName:     z.string().optional().nullable(),
  legalName:    z.string().optional().nullable(),
  taxId:        z.string().optional().nullable(),
  email:        z.string().email().optional().or(z.literal('')),
  phone:        z.string().optional(),
  website:      z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  postalCode:   z.string().optional(),
  city:         z.string().optional(),
  country:      z.string().default('PL'),
  notes:        z.string().optional().nullable(),
  logoUrl:      z.string().url().optional().nullable().or(z.literal('')),
  status:       z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  // Rozliczenie
  billingIntervalMinutes:      z.number().int().positive().default(30),
  contractStartDate:           z.string().optional().nullable(),
  // Umowa serwisowa
  hasContract:                 z.boolean().optional(),
  contractHours:               z.number().int().positive().optional().nullable(),
  contractMonthlyValue:        z.number().positive().optional().nullable(),
  contractHourlyRateOverLimit: z.number().positive().optional().nullable(),
  contractScope:               z.string().optional().nullable(),
  contractAttachmentUrl:       z.string().optional().nullable(),
  hourlyRate:                  z.number().positive().optional().nullable(),
  managerId:                   z.string().uuid().optional().nullable(),
  // Usługi dodatkowe
  enableSecurityAudit:         z.boolean().optional(),
  enableNetworkScan:           z.boolean().optional(),
  enableManagedBackup:         z.boolean().optional(),
  enableMonthlyReport:         z.boolean().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listClientsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().optional(),
  page:   z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
  limit:  z.string().optional().transform(v => v ? parseInt(v, 10) : 20),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
