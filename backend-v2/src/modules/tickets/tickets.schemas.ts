import { z } from 'zod';

// Komponenty master-ticketa — każde tworzy osobne dziecko (Task / Order / CrmActivity).
export const serviceComponentSchema = z.object({
  serviceMode: z.enum(['ONSITE', 'REMOTE']).default('ONSITE'),
  deviceId: z.string().uuid().optional().nullable(),
  freeTextSubject: z.string().max(300).optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export const orderItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  unitNet: z.coerce.number().nonnegative().default(0),
});
export const orderComponentSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  supplierName: z.string().max(120).optional(),
  expectedDeliveryDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional(),
});

export const crmActivitySchema = z.object({
  type: z.enum(['PHONE', 'MEETING', 'EMAIL', 'QUOTE', 'OTHER']),
  title: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  followUpRequired: z.boolean().default(false),
  followUpAt: z.string().datetime().optional().nullable(),
  billable: z.boolean().default(false),
  quoteValueNet: z.coerce.number().nonnegative().optional(),
});
export const crmComponentSchema = z.object({
  activities: z.array(crmActivitySchema).min(1),
});

export const componentsSchema = z.object({
  service: serviceComponentSchema.optional(),
  order: orderComponentSchema.optional(),
  crm: crmComponentSchema.optional(),
}).refine((c) => c.service || c.order || c.crm, { message: 'Wybierz przynajmniej jeden typ zgłoszenia' });

export const createTicketSchema = z.object({
  // MASTER
  clientWorkspaceId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(1).max(10_000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueAt: z.string().datetime().optional(),
  source: z.enum(['PORTAL', 'EMAIL', 'AGENT', 'PHONE', 'AI_CHAT', 'MANUAL', 'API']).default('MANUAL'),
  requesterName: z.string().max(120).optional(),
  requesterEmail: z.string().email().optional(),
  requesterPhone: z.string().max(40).optional(),
  components: componentsSchema,
  // Legacy fields (kept for compat)
  type: z.enum(['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER']).optional(),
  category: z.string().max(80).optional(),
  deviceId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().min(3).max(200).trim().optional(),
  description: z.string().min(1).max(10_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.string().max(80).optional().nullable(),
  deviceId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const transitionSchema = z.object({
  to: z.enum(['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED']),
  resolutionSummary: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
});

export const commentSchema = z.object({
  comment: z.string().min(1).max(10_000),
  isInternal: z.boolean().default(false),
});

export const listQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedToUserId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});

export const rateTicketSchema = z.object({
  rating: z.number().int().min(1).max(3),
  comment: z.string().max(1000).optional(),
});
