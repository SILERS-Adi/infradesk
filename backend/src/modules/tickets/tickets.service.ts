import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { notifyAgent } from '../../utils/websocket';
import { notifyTicketAssigned } from '../../utils/ticketNotifications';
import { sendPushToUser } from '../../lib/webpush';
import {
  CreateTicketInput,
  UpdateTicketInput,
  AddCommentInput,
  AssignTicketInput,
  ChangeStatusInput,
} from './tickets.validation';
import { TicketStatus, TicketType, TicketPriority, TicketSource } from '@prisma/client';

// Helper: build workspace filter for MSP scope
function wsFilter(workspaceId?: string, wsIds?: string[]): Record<string, unknown> {
  if (wsIds && wsIds.length > 1) return { workspaceId: { in: wsIds } };
  if (workspaceId) return { workspaceId };
  return {};
}

async function generateTaskNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TSK-${year}-`;
  const last = await prisma.task.findFirst({
    where: { taskNumber: { startsWith: prefix } },
    orderBy: { taskNumber: 'desc' },
    select: { taskNumber: true },
  });
  const lastNum = last ? parseInt(last.taskNumber.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

const ticketSelect = {
  id: true,
  ticketNumber: true,
  workspaceId: true,
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
  serviceMode: true,
  reporterName: true,
  reporterPhone: true,
  rating: true,
  ratingComment: true,
  ratedAt: true,
  ratedByUserId: true,
  createdAt: true,
  updatedAt: true,
  workspace: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, city: true } },
  device: { select: { id: true, name: true, manufacturer: true, model: true, rustdeskId: true, locationId: true, assignedUser: { select: { id: true, firstName: true, lastName: true } } } },
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
  workspaceId?: string | null;
  workspaceIds?: string[];
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
  scopeFilter?: Record<string, unknown>;
  requestingUser?: any;
}) {
  const {
    workspaceId, workspaceIds, locationId, deviceId, status, priority, type,
    assignedToUserId, unassigned, search, page = 1, limit: rawLimit = 20, scopeFilter,
  } = params;
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (workspaceIds && workspaceIds.length > 0) {
    where.workspaceId = { in: workspaceIds };
  } else if (workspaceId) {
    where.workspaceId = workspaceId;
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

  // Apply workspace scope filter (Etap 1C.2)
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), scopeFilter];
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
  workspaceId?: string,
  _requestingUser?: any,
  wsIds?: string[],
) {
  const selectWithComments = {
    ...ticketSelect,
    comments: {
      select: {
        id: true,
        ticketId: true,
        userId: true,
        comment: true,
        isInternal: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  // MSP: allow access to tickets from client workspaces
  const wsFilter = wsIds && wsIds.length > 1
    ? { workspaceId: { in: wsIds } }
    : workspaceId ? { workspaceId } : {};

  const ticket = Object.keys(wsFilter).length > 0
    ? await prisma.ticket.findFirst({
        where: { id, ...wsFilter },
        select: selectWithComments,
      })
    : await prisma.ticket.findUnique({
        where: { id },
        select: selectWithComments,
      });

  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  return ticket;
}

export async function createTicket(
  data: CreateTicketInput & { workspaceId?: string },
  requestingUser: { userId: string },
  workspaceId?: string,
) {
  const callerWorkspaceId = workspaceId || data.workspaceId;
  if (!callerWorkspaceId) throw new AppError('workspaceId is required', 400);

  // ── MSP "on behalf of" support ─────────────────────────────────
  // If MSP passes clientWorkspaceId, the ticket lives in the client's workspace
  // and the MSP is recorded as providerWorkspaceId.
  let resolvedWorkspaceId = callerWorkspaceId;
  let onBehalfOfClient = false;
  if (data.clientWorkspaceId && data.clientWorkspaceId !== callerWorkspaceId) {
    const relation = await prisma.workspaceRelation.findFirst({
      where: {
        providerWorkspaceId: callerWorkspaceId,
        clientWorkspaceId: data.clientWorkspaceId,
        status: 'ACTIVE',
      },
      select: { id: true, canCreateTicketsOnBehalf: true },
    });
    if (!relation) {
      throw new AppError('Brak relacji z tym klientem', 403);
    }
    if (relation.canCreateTicketsOnBehalf === false) {
      throw new AppError('Brak uprawnień do tworzenia zgłoszeń dla tego klienta', 403);
    }
    resolvedWorkspaceId = data.clientWorkspaceId;
    onBehalfOfClient = true;
  }

  // Auto-fill locationId — find first location for workspace if not provided
  if (!data.locationId) {
    const loc = await prisma.location.findFirst({ where: { workspaceId: resolvedWorkspaceId }, select: { id: true } });
    if (loc) {
      data.locationId = loc.id;
    } else {
      // Create default location
      const newLoc = await prisma.location.create({
        data: { workspaceId: resolvedWorkspaceId, name: 'Główna', type: 'OFFICE', addressLine1: '-', postalCode: '', city: '' },
      });
      data.locationId = newLoc.id;
    }
  }

  const ticketNumber = await generateTicketNumber();

  const assignedToUserId = data.assignedToUserId || undefined;

  // Auto-calculate SLA deadline from SlaPolicy (or defaults if no policy)
  let dueAt = data.dueAt ? new Date(data.dueAt) : undefined;
  if (!dueAt) {
    const slaPolicy = await prisma.slaPolicy.findUnique({
      where: { workspaceId_priority: { workspaceId: resolvedWorkspaceId, priority: data.priority as any } },
    }).catch(() => null);
    const defaultHours: Record<string, number> = { LOW: 48, MEDIUM: 24, HIGH: 8, CRITICAL: 4 };
    const hours = slaPolicy?.resolveTimeH ?? defaultHours[data.priority] ?? 24;
    dueAt = new Date(Date.now() + hours * 3600000);
  }

  // Auto-resolve ticket provider (multi-tenant routing)
  let requesterWorkspaceId: string | null = null;
  let providerWorkspaceId: string | null = null;
  if (onBehalfOfClient) {
    // MSP creating on behalf of client — explicit routing
    requesterWorkspaceId = resolvedWorkspaceId;        // client (where ticket lives)
    providerWorkspaceId  = callerWorkspaceId;          // MSP
  } else {
    try {
      const { resolveTicketProvider } = require('../../utils/ticketRouting');
      const routing = await resolveTicketProvider(resolvedWorkspaceId);
      if (!routing.isInternal && routing.providerWorkspaceId) {
        requesterWorkspaceId = resolvedWorkspaceId;
        providerWorkspaceId = routing.providerWorkspaceId;
      }
    } catch (_) { /* ticketRouting not available — skip */ }
  }

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      workspaceId: resolvedWorkspaceId,
      requesterWorkspaceId,
      providerWorkspaceId,
      locationId: data.locationId,
      deviceId: data.deviceId,
      createdByUserId: requestingUser.userId,
      assignedToUserId,
      type: data.type as TicketType,
      priority: data.priority as TicketPriority,
      status: assignedToUserId ? TicketStatus.ASSIGNED : TicketStatus.PENDING,
      source: data.source as TicketSource,
      title: data.title,
      description: data.description,
      reporterName: data.reporterName,
      reporterPhone: data.reporterPhone,
      dueAt,
      billedInContract: data.billedInContract ?? false,
      serviceMode: data.serviceMode ?? null,
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
        workspaceId: resolvedWorkspaceId,
        ticketId: ticket.id,
        assignedToUserId,
        createdByUserId: requestingUser.userId,
        title: ticket.title,
        description: ticket.description,
        status: 'NEW',
      },
    });
  }

  // Notify workspace's active agents
  prisma.agentRegistration.findMany({
    where: { workspaceId: resolvedWorkspaceId, status: 'ACTIVE' },
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
  performedByUserId: string,
  workspaceId?: string,
  wsIds?: string[],
) {
  const existing = await prisma.ticket.findFirst({ where: { id, ...wsFilter(workspaceId, wsIds) } });
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
  requestingUser: { userId: string },
  workspaceId?: string,
  wsIds?: string[],
) {
  const wf = wsFilter(workspaceId, wsIds);
  const ticket = Object.keys(wf).length > 0
    ? await prisma.ticket.findFirst({ where: { id: ticketId, ...wf } })
    : await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      userId: requestingUser.userId,
      comment: data.comment,
      isInternal: data.isInternal,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
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
      where: { workspaceId: ticket.workspaceId, status: 'ACTIVE' },
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

  // Push notification — nowy komentarz
  const pushPayload = {
    title: `Komentarz — ${ticket.ticketNumber}`,
    body: data.comment.slice(0, 100),
    url: `/tickets/${ticketId}`,
  };
  // Notify creator (if commenter is not the creator)
  if (ticket.createdByUserId && ticket.createdByUserId !== requestingUser.userId) {
    sendPushToUser(ticket.createdByUserId, pushPayload).catch(() => {});
  }
  // Notify assigned tech (if commenter is not the assignee)
  if (ticket.assignedToUserId && ticket.assignedToUserId !== requestingUser.userId) {
    sendPushToUser(ticket.assignedToUserId, pushPayload).catch(() => {});
  }

  return comment;
}

export async function assignTicket(
  ticketId: string,
  data: AssignTicketInput,
  performedByUserId: string,
  workspaceId?: string,
  wsIds?: string[],
) {
  const wf = wsFilter(workspaceId, wsIds);
  const ticket = Object.keys(wf).length > 0
    ? await prisma.ticket.findFirst({ where: { id: ticketId, ...wf } })
    : await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  if (data.assignedToUserId) {
    const user = await prisma.user.findUnique({ where: { id: data.assignedToUserId } });
    if (!user) {
      throw new AppError('Invalid user', 400);
    }
  }

  const updateData: Record<string, unknown> = {
    assignedToUserId: data.assignedToUserId,
    status: data.assignedToUserId ? TicketStatus.ASSIGNED : TicketStatus.PENDING,
  };
  if (data.serviceMode) updateData.serviceMode = data.serviceMode;

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
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
          workspaceId: ticket.workspaceId,
          ticketId,
          assignedToUserId: data.assignedToUserId,
          createdByUserId: performedByUserId,
          title: ticket.title,
          description: ticket.description,
          status: 'NEW',
        },
      });
    }

    // Powiadom technika o przypisaniu
    const tech = await prisma.user.findUnique({ where: { id: data.assignedToUserId }, select: { firstName: true, lastName: true } });
    if (tech) notifyTicketAssigned(ticketId, `${tech.firstName} ${tech.lastName}`);

    // Push do przypisanego technika
    sendPushToUser(data.assignedToUserId, {
      title: 'Nowe przypisane zgłoszenie',
      body: `${ticket.ticketNumber}: ${ticket.title}`,
      url: `/tickets/${ticketId}`,
    }).catch(() => {});
  }

  return updated;
}

export async function changeTicketStatus(
  ticketId: string,
  data: ChangeStatusInput,
  performedByUserId: string,
  workspaceId?: string,
  wsIds?: string[],
) {
  const wf = wsFilter(workspaceId, wsIds);
  const ticket = Object.keys(wf).length > 0
    ? await prisma.ticket.findFirst({ where: { id: ticketId, ...wf } })
    : await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new AppError('Ticket not found', 404);
  }

  const previousStatus = ticket.status;
  const newStatus = data.status as TicketStatus;
  const now = new Date();

  // State machine: validate allowed transitions
  const allowedTransitions: Record<string, string[]> = {
    NEW:                  ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
    PENDING:              ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
    ASSIGNED:             ['IN_PROGRESS', 'WAITING_FOR_CLIENT', 'RESOLVED', 'CANCELLED'],
    IN_PROGRESS:          ['WAITING_FOR_CLIENT', 'RESOLVED', 'CANCELLED'],
    WAITING_FOR_CLIENT:   ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
    RESOLVED:             ['CLOSED', 'IN_PROGRESS'], // reopen if not properly resolved
    CLOSED:               [], // terminal state
    COMPLETED:            [], // terminal state (legacy alias for CLOSED)
    CANCELLED:            ['NEW'], // reopen
  };
  const allowed = allowedTransitions[previousStatus] || [];
  if (allowed.length > 0 && !allowed.includes(newStatus)) {
    throw new AppError(`Niedozwolona zmiana statusu: ${previousStatus} → ${newStatus}`, 400);
  }

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
    where: { workspaceId: ticket.workspaceId, status: 'ACTIVE' },
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

  // Push — zmiana statusu
  const statusPush = { title: `Zgłoszenie ${ticket.ticketNumber}`, body: `Status: ${statusLabels[newStatus] ?? newStatus}`, url: `/tickets/${ticketId}` };
  if (ticket.createdByUserId && ticket.createdByUserId !== performedByUserId) {
    sendPushToUser(ticket.createdByUserId, statusPush).catch(() => {});
  }
  if (ticket.assignedToUserId && ticket.assignedToUserId !== performedByUserId) {
    sendPushToUser(ticket.assignedToUserId, statusPush).catch(() => {});
  }

  // Auto-create CRM activity when ticket is resolved/completed/closed
  if (['RESOLVED', 'COMPLETED', 'CLOSED'].includes(newStatus)) {
    const ticketData = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { workspaceId: true, locationId: true, deviceId: true, title: true, ticketNumber: true, resolutionSummary: true },
    });
    if (ticketData?.workspaceId) {
      await prisma.crmActivity.create({
        data: {
          workspaceId: ticketData.workspaceId,
          locationId: ticketData.locationId,
          deviceId: ticketData.deviceId,
          createdByUserId: performedByUserId,
          type: 'MEETING',
          title: `Ticket ${ticketData.ticketNumber} zamknięty`,
          notes: ticketData.resolutionSummary || `Zgłoszenie "${ticketData.title}" zostało rozwiązane.`,
          occurredAt: new Date(),
        },
      });
    }
  }

  return updated;
}

export async function cancelTicket(
  ticketId: string,
  performedByUserId: string,
  workspaceId?: string,
  wsIds?: string[],
) {
  const wf = wsFilter(workspaceId, wsIds);
  const ticket = Object.keys(wf).length > 0
    ? await prisma.ticket.findFirst({ where: { id: ticketId, ...wf } })
    : await prisma.ticket.findUnique({ where: { id: ticketId } });
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

export async function deleteTicket(id: string, performedByUserId: string, workspaceId?: string, wsIds?: string[]) {
  const wf = wsFilter(workspaceId, wsIds);
  const existing = Object.keys(wf).length > 0
    ? await prisma.ticket.findFirst({ where: { id, ...wf } })
    : await prisma.ticket.findUnique({ where: { id } });
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
