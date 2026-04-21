import { prisma } from '../../lib/prisma';
import { HttpError } from '../../utils/httpError';
import { assertTransition, type TicketStatus } from '../../utils/ticketStateMachine';
import type { CreateTicketInput, UpdateTicketInput } from './tickets.schemas';

/**
 * Generates the next ticket number for a workspace: "T-2026-0001".
 * Monotonic, gapless per workspace per year.
 */
export async function nextTicketNumber(workspaceId: string, year = new Date().getFullYear()): Promise<string> {
  const prefix = `T-${year}-`;
  // Use a transaction + FOR UPDATE to avoid race conditions on concurrent creates.
  return prisma.$transaction(async (tx) => {
    const last = await tx.ticket.findFirst({
      where: { workspaceId, ticketNumber: { startsWith: prefix } },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    let nextN = 1;
    if (last) {
      const matched = last.ticketNumber.match(/-(\d+)$/);
      if (matched) nextN = parseInt(matched[1]!, 10) + 1;
    }
    return `${prefix}${String(nextN).padStart(4, '0')}`;
  });
}

export async function createTicket(workspaceId: string, userId: string, input: CreateTicketInput) {
  // Validate references belong to workspace.
  if (input.deviceId) {
    const d = await prisma.device.findFirst({ where: { id: input.deviceId, workspaceId }, select: { id: true } });
    if (!d) throw HttpError.badRequest('Device nie należy do tego workspace', 'invalid_device');
  }
  if (input.locationId) {
    const l = await prisma.location.findFirst({ where: { id: input.locationId, workspaceId }, select: { id: true } });
    if (!l) throw HttpError.badRequest('Location nie należy do tego workspace', 'invalid_location');
  }
  if (input.assignedToUserId) {
    const m = await prisma.membership.findFirst({
      where: { userId: input.assignedToUserId, workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) throw HttpError.badRequest('Assignee nie jest członkiem workspace', 'invalid_assignee');
  }

  const ticketNumber = await nextTicketNumber(workspaceId);

  const initialStatus: TicketStatus = input.assignedToUserId ? 'ASSIGNED' : 'OPEN';

  const ticket = await prisma.ticket.create({
    data: {
      workspaceId,
      ticketNumber,
      title: input.title,
      description: input.description,
      status: initialStatus,
      priority: input.priority,
      type: input.type,
      source: input.source,
      category: input.category,
      deviceId: input.deviceId ?? null,
      locationId: input.locationId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      createdByUserId: userId,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      requesterPhone: input.requesterPhone,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      events: {
        create: { userId, eventType: 'created', toValue: initialStatus },
      },
    },
    include: { events: true },
  });
  return ticket;
}

export async function listTickets(workspaceId: string, opts: {
  status?: string; priority?: string; assignedToUserId?: string; deviceId?: string;
  search?: string; limit: number; cursor?: string;
}) {
  const where: Record<string, unknown> = { workspaceId, deletedAt: null };
  if (opts.status) where.status = { in: opts.status.split(',') };
  if (opts.priority) where.priority = { in: opts.priority.split(',') };
  if (opts.assignedToUserId) where.assignedToUserId = opts.assignedToUserId;
  if (opts.deviceId) where.deviceId = opts.deviceId;
  if (opts.search) {
    where.OR = [
      { title: { contains: opts.search, mode: 'insensitive' } },
      { description: { contains: opts.search, mode: 'insensitive' } },
      { ticketNumber: { contains: opts.search.toUpperCase() } },
    ];
  }
  const items = await prisma.ticket.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: opts.limit + 1,
    cursor: opts.cursor ? { id: opts.cursor } : undefined,
    skip: opts.cursor ? 1 : 0,
    select: {
      id: true, ticketNumber: true, title: true, status: true, priority: true,
      category: true, createdAt: true, updatedAt: true, dueAt: true,
      assignedToUserId: true, deviceId: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      device: { select: { id: true, name: true } },
    },
  });
  const hasMore = items.length > opts.limit;
  const slice = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore ? slice[slice.length - 1]!.id : null;
  return { items: slice, nextCursor };
}

export async function getTicket(workspaceId: string, id: string) {
  const t = await prisma.ticket.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      device: { select: { id: true, name: true, hostname: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, comment: true, isInternal: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!t) throw HttpError.notFound('Ticket not found');
  return t;
}

export async function updateTicket(workspaceId: string, userId: string, id: string, patch: UpdateTicketInput) {
  const t = await prisma.ticket.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!t) throw HttpError.notFound();

  const data: Record<string, unknown> = { ...patch };
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;

  // Auto-transition OPEN→ASSIGNED when a user is assigned.
  if (patch.assignedToUserId && t.status === 'OPEN') {
    data.status = 'ASSIGNED';
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({ where: { id }, data });
    await tx.ticketEvent.create({
      data: { ticketId: id, userId, eventType: 'updated', metadata: patch as never },
    });
    if (patch.assignedToUserId && patch.assignedToUserId !== t.assignedToUserId) {
      await tx.ticketEvent.create({
        data: {
          ticketId: id, userId, eventType: 'assigned',
          fromValue: t.assignedToUserId, toValue: patch.assignedToUserId,
        },
      });
    }
    return u;
  });
  return updated;
}

export async function transitionTicket(
  workspaceId: string, userId: string, id: string,
  to: TicketStatus, opts: { resolutionSummary?: string; reason?: string } = {},
) {
  const t = await prisma.ticket.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!t) throw HttpError.notFound();
  try {
    assertTransition(t.status as TicketStatus, to);
  } catch (err) {
    throw HttpError.badRequest((err as Error).message, 'illegal_transition');
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === 'RESOLVED') {
    data.resolvedAt = now;
    data.resolvedByUserId = userId;
    if (opts.resolutionSummary) data.resolutionSummary = opts.resolutionSummary;
    if (!t.firstResponseAt) data.firstResponseAt = now;
  }
  if (to === 'CLOSED') data.closedAt = now;
  if (t.status === 'NEW' && (to === 'OPEN' || to === 'ASSIGNED')) {
    data.firstResponseAt = t.firstResponseAt ?? now;
  }

  return prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({ where: { id }, data });
    await tx.ticketEvent.create({
      data: {
        ticketId: id, userId, eventType: 'status_changed',
        fromValue: t.status, toValue: to,
        metadata: opts.reason ? { reason: opts.reason } : undefined,
      },
    });
    return u;
  });
}

export async function addComment(workspaceId: string, userId: string, ticketId: string, comment: string, isInternal: boolean) {
  const t = await prisma.ticket.findFirst({
    where: { id: ticketId, workspaceId, deletedAt: null },
    select: { id: true, status: true, firstResponseAt: true },
  });
  if (!t) throw HttpError.notFound();

  return prisma.$transaction(async (tx) => {
    const c = await tx.ticketComment.create({ data: { ticketId, userId, comment, isInternal } });
    await tx.ticketEvent.create({ data: { ticketId, userId, eventType: 'commented', metadata: { commentId: c.id, isInternal } } });
    if (!t.firstResponseAt && !isInternal) {
      await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: new Date() } });
    }
    return c;
  });
}

export async function rateTicket(workspaceId: string, userId: string, ticketId: string, rating: number, comment?: string) {
  const t = await prisma.ticket.findFirst({
    where: { id: ticketId, workspaceId, deletedAt: null },
    select: { id: true, status: true, createdByUserId: true },
  });
  if (!t) throw HttpError.notFound();
  if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') {
    throw HttpError.badRequest('Oceniaj tylko rozwiązane tickety', 'rating_not_allowed');
  }
  return prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({
      where: { id: ticketId },
      data: { rating, ratingComment: comment, ratedAt: new Date() },
    });
    await tx.ticketEvent.create({
      data: { ticketId, userId, eventType: 'rated', toValue: String(rating), metadata: comment ? { comment } : undefined },
    });
    return u;
  });
}

export async function deleteTicket(workspaceId: string, userId: string, ticketId: string) {
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId, deletedAt: null }, select: { id: true } });
  if (!t) throw HttpError.notFound();
  return prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { deletedAt: new Date() } });
    await tx.ticketEvent.create({ data: { ticketId, userId, eventType: 'deleted' } });
  });
}
