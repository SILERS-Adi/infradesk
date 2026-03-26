import { z } from 'zod';

export const createTicketSchema = z.object({
  clientId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional().nullable(),
  type: z.enum(['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'REKLAMACJA', 'OTHER']).default('INCIDENT'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  source: z.enum(['CLIENT_PORTAL', 'INTERNAL', 'PHONE', 'EMAIL', 'QR_SCAN', 'AGENT', 'IN_PERSON', 'MESSAGE']).default('INTERNAL'),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  dueAt: z.string().datetime().optional().nullable(),
  billedInContract: z.boolean().optional().default(false),
  serviceMode: z.enum(['REMOTE', 'ONSITE']).optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  reporterName: z.string().optional(),
  reporterPhone: z.string().optional(),
});

export const updateTicketSchema = z.object({
  locationId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional().nullable(),
  type: z.enum(['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'OTHER']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  resolutionSummary: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  billedInContract: z.boolean().optional(),
});

export const addCommentSchema = z.object({
  comment: z.string().min(1),
  isInternal: z.boolean().default(false),
});

export const assignTicketSchema = z.object({
  assignedToUserId: z.string().uuid().nullable(),
  serviceMode: z.enum(['REMOTE', 'ONSITE']).optional().nullable(),
});

export const changeStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'RESOLVED', 'CLOSED']),
  resolutionSummary: z.string().optional().nullable(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type AddCommentInput = z.infer<typeof addCommentSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
