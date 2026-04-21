import { z } from 'zod';

export const createTicketSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().min(1).max(10_000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  type: z.enum(['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER']).default('INCIDENT'),
  source: z.enum(['PORTAL', 'EMAIL', 'AGENT', 'PHONE', 'AI_CHAT', 'MANUAL', 'API']).default('MANUAL'),
  category: z.string().max(80).optional(),
  deviceId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  requesterName: z.string().max(120).optional(),
  requesterEmail: z.string().email().optional(),
  requesterPhone: z.string().max(40).optional(),
  dueAt: z.string().datetime().optional(),
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
