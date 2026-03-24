import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { notifyAgent } from '../../utils/websocket';
import {
  CreateTicketInput,
  UpdateTicketInput,
  AddCommentInput,
  AssignTicketInput,
  ChangeStatusInput,
} from './tickets.validation';
import { TicketStatus, TicketType, TicketPriority, TicketSource } from '@prisma/client';

async function generateTaskNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.task.count({
    where: { taskNumber: { startsWith: `TSK-${year}-` } },
  });
  return `TSK-${year}-${String(count + 1).padStart(4, '0')}`;
}

const ticketSelect = {
  id: true,
  ticketNumber: true,
  clientId: true,
  locationId: true,
  deviceId: true,
  createdByUserId: true,
  assignedToUserId: true,
  type: true,
  priority: true,
  status: true,
  source: true,
  title: true,
  description: true,
  resolutionSummary: true,
  reportedAt: true,
  dueAt: true,
  resolvedAt: true,
  closedAt: true,
  billedInContract: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, city: true } },
  device: { select: { id: true, name: true, manufacturer: true, model: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
};

async function generateTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.ticket.count({
    where: {
      ticketNumber: { startsWith: `INF-${year}-` },
    },
  });
  const num = String(count + 1).padStart(4, '0');
  return `INF-${year}-${num}`;
}

export async function listTickets(params: {
  clientId?: string;
  locationId?: string;
  deviceId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  assignedToUserId?: string;
  unassigned?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  requestingUser: { role: string; clientId?: string | null };
}) {
  const {
    clientId, locationId, deviceId, status, priority, type,
    assignedToUserId, unassigned, search, page = 1, limit = 20, requestingUser,
  } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (requestingUser.role === 'CLIENT') {
    where.clientId = requestingUser.clientId;
  } else if (clientId) {
    where.clientId = clientId;
  }

  if (locationId) where.locationId = locationId;
  if (deviceId) where.deviceId = deviceId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (type) where.type = type;
  if (unassigned) where.assignedToUserId = null;
  else if (assignedToUserId) where.assignedToUserId = assignedToUserId;

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { ticketNumber: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: ticketSelect,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    data: tickets,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTicketById(
  id: string,
  requestingUser: { role: string; clientId?: string | null }
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      ...ticketSelect,
      comments: {
        where: requestingUser.role === 'CLIENT' ? { isInternal: false } : {},
        select: {
          id: true,
          ticketId: true,
          userId: true,
          comment: true,
          isInternal: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  if (requestingUser.role === 'CLIENT' && ticket.clientId !== requestingUser.clientId) {
    throw new AppError('Access denied', 403);
  }

  return ticket;
}

export async function createTicket(
  data: CreateTicketInput,
  requestingUser: { userId: string; role: string; clientId?: string | null }
) {
  // CLIENT can only create tickets for their own client
  if (requestingUser.role === 'CLIENT') {
    if (data.clientId !== requestingUser.clientId) {
      throw new AppError('Cannot create ticket for another client', 403);
    }
  }

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) {
    throw new AppError('Client not found', 404);
  }

  const location = await prisma.location.findUnique({ where: { id: data.locationId } });
  if (!location || location.clientId !== data.clientId) {
    throw new AppError('Location not found or does not belong to client', 404);
  }

  const ticketNumber = await generateTicketNumber();

  const assignedToUserId = data.assignedToUserId || undefined;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      clientId: data.clientId,
      locationId: data.locationId,
      deviceId: data.deviceId,
      createdByUserId: requestingUser.userId,
      assignedToUserId,
      type: data.type as TicketType,
      priority: data.priority as TicketPriority,
      status: assignedToUserId ? TicketStatus.ASSIGNED : TicketStatus.PENDING,
      source: requestingUser.role === 'CLIENT'
        ? TicketSource.CLIENT_PORTAL
        : data.source as TicketSource,
      title: data.title,
      description: data.description,
      reporterName: data.reporterName,
      reporterPhone: data.reporterPhone,
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      billedInContract: data.billedInContract ?? false,
    },
    select: ticketSelect,
  });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: ticket.id,
    actionType: 'CREATE',
    description: `Ticket ${ticket.ticketNumber} created: "${ticket.title}"`,
    performedByUserId: requestingUser.userId,
  });

  // If assigned on create — also create a task
  if (assignedToUserId) {
    const taskNumber = await generateTaskNumber();
    await prisma.task.create({
      data: {
        taskNumber,
        ticketId: ticket.id,
        assignedToUserId,
        createdByUserId: requestingUser.userId,
        title: ticket.title,
        description: ticket.description,
        status: 'NEW',
      },
    });
  }

  // Notify client's active agents
  prisma.agentRegistration.findMany({
    where: { clientId: data.clientId, status: 'ACTIVE' },
    select: { agentToken: true },
  }).then(regs => {
    for (const reg of regs) {
      notifyAgent(reg.agentToken, {
        type: 'notification',
        title: 'Nowe zgłoszenie',
        body: `${ticket.ticketNumber}: ${ticket.title}`,
      });
    }
  }).catch(() => {});

  return ticket;
}

export async function updateTicket(
  id: string,
  data: UpdateTicketInput,
  performedByUserId: string
) {
  const existing = await prisma.ticket.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Ticket not found', 404);
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...data,
      dueAt: data.dueAt ? new Date(data.dueAt) : data.dueAt,
      type: data.type as TicketType | undefined,
      priority: data.priority as TicketPriority | undefined,
    },
    select: ticketSelect,
  });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: id,
    actionType: 'UPDATE',
    description: `Ticket ${ticket.ticketNumber} updated`,
    performedByUserId,
  });

  return ticket;
}

export async function addTicketComment(
  ticketId: string,
  data: AddCommentInput,
  requestingUser: { userId: string; role: string; clientId?: string | null }
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  if (requestingUser.role === 'CLIENT') {
    if (ticket.clientId !== requestingUser.clientId) {
      throw new AppError('Access denied', 403);
    }
    if (data.isInternal) {
      throw new AppError('Clients cannot create internal comments', 403);
    }
  }

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      userId: requestingUser.userId,
      comment: data.comment,
      isInternal: data.isInternal,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
    },
  });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: ticketId,
    actionType: 'COMMENT',
    description: `Comment added to ticket ${ticket.ticketNumber}`,
    performedByUserId: requestingUser.userId,
    metadata: { isInternal: data.isInternal },
  });

  // Powiadom agentów klienta o nowym komentarzu (tylko publiczne)
  if (!data.isInternal) {
    prisma.agentRegistration.findMany({
      where: { clientId: ticket.clientId, status: 'ACTIVE' },
      select: { agentToken: true },
    }).then(regs => {
      for (const reg of regs) {
        notifyAgent(reg.agentToken, {
          type:  'notification',
          title: `Zgłoszenie ${ticket.ticketNumber}`,
          body:  `Nowa odpowiedź: ${data.comment.slice(0, 80)}${data.comment.length > 80 ? '…' : ''}`,
        });
      }
    }).catch(() => {});
  }

  return comment;
}

export async function assignTicket(
  ticketId: string,
  data: AssignTicketInput,
  performedByUserId: string
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  if (data.assignedToUserId) {
    const user = await prisma.user.findUnique({ where: { id: data.assignedToUserId } });
    if (!user || user.role === 'CLIENT') {
      throw new AppError('Invalid technician user', 400);
    }
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedToUserId: data.assignedToUserId,
      status: data.assignedToUserId ? TicketStatus.ASSIGNED : TicketStatus.PENDING,
    },
    select: ticketSelect,
  });

  const assigneeName = data.assignedToUserId
    ? `User ${data.assignedToUserId}`
    : 'unassigned';

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: ticketId,
    actionType: 'ASSIGN',
    description: `Ticket ${ticket.ticketNumber} assigned to ${assigneeName}`,
    performedByUserId,
    metadata: { assignedToUserId: data.assignedToUserId },
  });

  // Utwórz lub zaktualizuj zadanie powiązane z tym zgłoszeniem
  if (data.assignedToUserId) {
    const existingTask = await prisma.task.findFirst({ where: { ticketId } });
    if (existingTask) {
      await prisma.task.update({
        where: { id: existingTask.id },
        data: { assignedToUserId: data.assignedToUserId },
      });
    } else {
      const taskNumber = await generateTaskNumber();
      await prisma.task.create({
        data: {
          taskNumber,
          ticketId,
          assignedToUserId: data.assignedToUserId,
          createdByUserId: performedByUserId,
          title: ticket.title,
          description: ticket.description,
          status: 'NEW',
        },
      });
    }
  }

  return updated;
}

export async function changeTicketStatus(
  ticketId: string,
  data: ChangeStatusInput,
  performedByUserId: string
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  const previousStatus = ticket.status;
  const newStatus = data.status as TicketStatus;
  const now = new Date();

  const updateData: Record<string, unknown> = { status: newStatus };

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
    select: ticketSelect,
  });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: ticketId,
    actionType: 'STATUS_CHANGE',
    description: `Ticket ${ticket.ticketNumber} status changed from ${previousStatus} to ${newStatus}`,
    performedByUserId,
    metadata: { from: previousStatus, to: newStatus },
  });

  // Notify client's active agents about status change
  const statusLabels: Record<string, string> = {
    NEW: 'Nowe', IN_PROGRESS: 'W trakcie', WAITING: 'Oczekuje',
    RESOLVED: 'Rozwiązane', CLOSED: 'Zamknięte',
  };
  prisma.agentRegistration.findMany({
    where: { clientId: ticket.clientId, status: 'ACTIVE' },
    select: { agentToken: true },
  }).then(regs => {
    for (const reg of regs) {
      notifyAgent(reg.agentToken, {
        type: 'notification',
        title: `Zgłoszenie ${ticket.ticketNumber}`,
        body: `Status zmieniony na: ${statusLabels[newStatus] ?? newStatus}`,
      });
    }
  }).catch(() => {});

  return updated;
}

export async function cancelTicket(
  ticketId: string,
  performedByUserId: string
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TicketStatus.CANCELLED },
    select: ticketSelect,
  });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: ticketId,
    actionType: 'CANCEL',
    description: `Ticket ${ticket.ticketNumber} cancelled`,
    performedByUserId,
  });

  return updated;
}

export async function completeTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === TicketStatus.CANCELLED) return;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TicketStatus.COMPLETED },
  });
}

export async function deleteTicket(id: string, performedByUserId: string) {
  const existing = await prisma.ticket.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Ticket not found', 404);
  }

  await prisma.ticket.delete({ where: { id } });

  await logActivity(prisma, {
    entityType: 'Ticket',
    entityId: id,
    actionType: 'DELETE',
    description: `Ticket ${existing.ticketNumber} deleted`,
    performedByUserId,
  });
}
