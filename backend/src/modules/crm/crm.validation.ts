import { z } from 'zod';

export const createCrmActivitySchema = z.object({
  clientId:         z.string().uuid(),
  locationId:       z.string().uuid().optional().nullable(),
  deviceId:         z.string().uuid().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  type:             z.enum(['PHONE', 'EMAIL', 'MEETING', 'QUOTE']),
  title:            z.string().optional(),
  occurredAt:       z.string().datetime().optional(),
  notes:            z.string().optional(),
  followUpRequired: z.boolean().default(false),
  // PHONE
  contactPerson:    z.string().optional(),
  // EMAIL
  subject:          z.string().optional(),
  attachmentUrls:   z.string().optional(),
  // MEETING
  meetingPlace:     z.string().optional(),
  participants:     z.string().optional(),
  reminderAt:       z.string().datetime().optional().nullable(),
  // QUOTE
  quoteDescription:  z.string().optional(),
  quoteStatus:       z.enum(['NEW', 'PREPARING', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED']).optional().nullable(),
  quoteValue:        z.number().optional().nullable(),
  quoteAttachmentUrl: z.string().optional().nullable(),
  linkedTicketId:    z.string().uuid().optional().nullable(),
});

export const updateCrmActivitySchema = z.object({
  title:            z.string().optional(),
  occurredAt:       z.string().datetime().optional(),
  notes:            z.string().optional(),
  followUpRequired: z.boolean().optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  locationId:       z.string().uuid().optional().nullable(),
  deviceId:         z.string().uuid().optional().nullable(),
  contactPerson:    z.string().optional(),
  subject:          z.string().optional(),
  attachmentUrls:   z.string().optional(),
  meetingPlace:     z.string().optional(),
  participants:     z.string().optional(),
  reminderAt:       z.string().datetime().optional().nullable(),
  quoteDescription:  z.string().optional(),
  quoteStatus:       z.enum(['NEW', 'PREPARING', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED']).optional().nullable(),
  quoteValue:        z.number().optional().nullable(),
  quoteAttachmentUrl: z.string().optional().nullable(),
  linkedTicketId:    z.string().uuid().optional().nullable(),
});

export const listCrmQuerySchema = z.object({
  clientId:  z.string().uuid().optional(),
  type:      z.enum(['PHONE', 'EMAIL', 'MEETING', 'QUOTE']).optional(),
  quoteStatus: z.enum(['NEW', 'PREPARING', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  followUp:  z.string().optional().transform(v => v === 'true' ? true : undefined),
  page:      z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
  limit:     z.string().optional().transform(v => v ? parseInt(v, 10) : 50),
});

export type CreateCrmActivityInput = z.infer<typeof createCrmActivitySchema>;
export type UpdateCrmActivityInput = z.infer<typeof updateCrmActivitySchema>;
