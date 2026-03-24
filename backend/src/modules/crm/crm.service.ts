import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { CreateCrmActivityInput, UpdateCrmActivityInput } from './crm.validation';
import { CrmActivityType, QuoteStatus } from '@prisma/client';

const activitySelect = {
  id: true,
  clientId: true,
  locationId: true,
  deviceId: true,
  createdByUserId: true,
  assignedToUserId: true,
  type: true,
  title: true,
  occurredAt: true,
  notes: true,
  followUpRequired: true,
  contactPerson: true,
  subject: true,
  attachmentUrls: true,
  meetingPlace: true,
  participants: true,
  reminderAt: true,
  quoteDescription: true,
  quoteStatus: true,
  quoteValue: true,
  quoteAttachmentUrl: true,
  linkedTicketId: true,
  createdAt: true,
  updatedAt: true,
  client:     { select: { id: true, name: true, logoUrl: true } },
  location:   { select: { id: true, name: true, city: true } },
  device:     { select: { id: true, name: true } },
  createdBy:  { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
};

export async function listCrmActivities(params: {
  clientId?: string;
  type?: CrmActivityType;
  quoteStatus?: QuoteStatus;
  followUp?: boolean;
  page?: number;
  limit?: number;
}) {
  const { clientId, type, quoteStatus, followUp, page = 1, limit = 50 } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (type) where.type = type;
  if (quoteStatus) where.quoteStatus = quoteStatus;
  if (followUp) where.followUpRequired = true;

  const [data, total] = await Promise.all([
    prisma.crmActivity.findMany({
      where, skip, take: limit,
      orderBy: { occurredAt: 'desc' },
      select: activitySelect,
    }),
    prisma.crmActivity.count({ where }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getCrmActivityById(id: string) {
  const activity = await prisma.crmActivity.findUnique({ where: { id }, select: activitySelect });
  if (!activity) throw new AppError('CRM activity not found', 404);
  return activity;
}

export async function createCrmActivity(
  data: CreateCrmActivityInput,
  createdByUserId: string
) {
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new AppError('Client not found', 404);

  return prisma.crmActivity.create({
    data: {
      clientId: data.clientId,
      locationId: data.locationId ?? null,
      deviceId: data.deviceId ?? null,
      createdByUserId,
      assignedToUserId: data.assignedToUserId ?? null,
      type: data.type as CrmActivityType,
      title: data.title,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      notes: data.notes,
      followUpRequired: data.followUpRequired ?? false,
      contactPerson: data.contactPerson,
      subject: data.subject,
      attachmentUrls: data.attachmentUrls,
      meetingPlace: data.meetingPlace,
      participants: data.participants,
      reminderAt: data.reminderAt ? new Date(data.reminderAt) : null,
      quoteDescription: data.quoteDescription,
      quoteStatus: (data.quoteStatus as QuoteStatus) ?? (data.type === 'QUOTE' ? QuoteStatus.NEW : null),
      quoteValue: data.quoteValue ?? null,
      quoteAttachmentUrl: data.quoteAttachmentUrl ?? null,
      linkedTicketId: data.linkedTicketId ?? null,
    },
    select: activitySelect,
  });
}

export async function updateCrmActivity(id: string, data: UpdateCrmActivityInput) {
  const existing = await prisma.crmActivity.findUnique({ where: { id } });
  if (!existing) throw new AppError('CRM activity not found', 404);

  return prisma.crmActivity.update({
    where: { id },
    data: {
      ...data,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
      reminderAt: data.reminderAt ? new Date(data.reminderAt) : data.reminderAt === null ? null : undefined,
      quoteStatus: data.quoteStatus as QuoteStatus | null | undefined,
    },
    select: activitySelect,
  });
}

export async function deleteCrmActivity(id: string) {
  const existing = await prisma.crmActivity.findUnique({ where: { id } });
  if (!existing) throw new AppError('CRM activity not found', 404);
  await prisma.crmActivity.delete({ where: { id } });
}

// Timeline: mix of CRM activities + Tickets for a client, sorted by date
export async function getClientTimeline(clientId: string) {
  const [activities, tickets] = await Promise.all([
    prisma.crmActivity.findMany({
      where: { clientId },
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: activitySelect,
    }),
    prisma.ticket.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, ticketNumber: true, title: true, status: true, priority: true,
        type: true, source: true, billedInContract: true,
        reportedAt: true, dueAt: true, resolvedAt: true, createdAt: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Merge and sort
  const merged = [
    ...activities.map(a => ({ ...a, _kind: 'CRM' as const, _date: a.occurredAt })),
    ...tickets.map(t => ({ ...t, _kind: 'TICKET' as const, _date: t.createdAt })),
  ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());

  return merged;
}
