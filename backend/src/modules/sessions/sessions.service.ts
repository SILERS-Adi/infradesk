import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { notifyTicketWorkStarted, notifyTicketWorkCompleted } from '../../utils/ticketNotifications';

const sessionInclude = {
  ticket: { select: { id: true, ticketNumber: true, title: true } },
  location: { select: { id: true, name: true } },
  device: { select: { id: true, name: true } },
  timeEntries: { orderBy: { startedAt: 'asc' as const } },
};

/** Oblicz sumaryczny czas pracy (w minutach) z time entries */
function calcWorkMinutes(entries: { startedAt: Date; endedAt: Date | null }[]): number {
  let totalMs = 0;
  for (const e of entries) {
    const end = e.endedAt ?? new Date();
    totalMs += end.getTime() - e.startedAt.getTime();
  }
  return Math.round(totalMs / 60000);
}

// ── List all sessions (admin view) ───────────────────────────────────────────

export async function listAllSessions(params: {
  workspaceId?: string | null;
  workspaceIds?: string[];
  techId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  scopeFilter?: Record<string, unknown>;
}) {
  const { workspaceId, workspaceIds, techId, from, to, page = 1, limit = 50, scopeFilter } = params;
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (workspaceIds && workspaceIds.length > 1) {
    where.workspaceId = { in: workspaceIds };
  } else if (workspaceId) {
    where.workspaceId = workspaceId;
  }
  if (techId) where.techId = techId;
  if (from || to) {
    where.startedAt = {};
    if (from) (where.startedAt as any).gte = new Date(from);
    if (to) (where.startedAt as any).lte = new Date(to);
  }

  // Apply workspace scope filter (Etap 1C.3)
  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), scopeFilter];
  }

  const [data, total] = await Promise.all([
    prisma.workSession.findMany({
      where, skip, take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        ...sessionInclude,
        tech: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.workSession.count({ where }),
  ]);

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

// ── Edit session (admin manual time correction) ─────────────────────────────

export async function updateSession(id: string, data: { startedAt?: string; endedAt?: string; durationMin?: number; notes?: string }, workspaceId: string) {
  const session = await prisma.workSession.findFirst({ where: { id, workspaceId } });
  if (!session) throw new AppError('Session not found', 404);

  const updateData: Record<string, unknown> = {};
  if (data.startedAt) updateData.startedAt = new Date(data.startedAt);
  if (data.endedAt) updateData.endedAt = new Date(data.endedAt);
  if (data.durationMin !== undefined) updateData.durationMin = data.durationMin;
  if (data.notes !== undefined) updateData.notes = data.notes;

  // Recalculate duration if start/end changed
  if (data.startedAt || data.endedAt) {
    const start = data.startedAt ? new Date(data.startedAt) : session.startedAt;
    const end = data.endedAt ? new Date(data.endedAt) : session.endedAt;
    if (start && end) {
      updateData.durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
    }
  }

  return prisma.workSession.update({
    where: { id },
    data: updateData,
    include: sessionInclude,
  });
}

export async function deleteSession(id: string, workspaceId: string) {
  const session = await prisma.workSession.findFirst({ where: { id, workspaceId } });
  if (!session) throw new AppError('Session not found', 404);
  await prisma.sessionTimeEntry.deleteMany({ where: { workSessionId: id } });
  await prisma.workSession.delete({ where: { id } });
}

// ── Agent session (legacy) ───────────────────────────────────────────────────

export async function startSession(techId: string, agentRegId: string) {
  const reg = await prisma.agentRegistration.findUnique({
    where: { id: agentRegId },
    select: { workspaceId: true, deviceId: true },
  });
  if (!reg?.workspaceId) throw new Error('Agent nie jest przypisany do workspace');

  const session = await prisma.workSession.create({
    data: {
      techId,
      agentRegId,
      workspaceId: reg.workspaceId,
      deviceId: reg.deviceId ?? undefined,
      startedAt: new Date(),
      status: 'ACTIVE',
    },
    include: { device: { select: { id: true, name: true } } },
  });

  // Pierwszy wpis czasu
  await prisma.sessionTimeEntry.create({
    data: { workSessionId: session.id },
  });

  return session;
}

// ── End session ──────────────────────────────────────────────────────────────

export async function endSession(id: string, techId: string, notes?: string) {
  const session = await prisma.workSession.findFirst({
    where: { id, techId },
    include: { timeEntries: true },
  });
  if (!session) throw new AppError('Sesja nie znaleziona', 404);
  if (session.status === 'COMPLETED') throw new AppError('Sesja już zakończona', 400);

  const now = new Date();

  // Zamknij otwarty wpis czasu (jeśli jest)
  const openEntry = session.timeEntries.find(e => !e.endedAt);
  if (openEntry) {
    const entryDuration = Math.round((now.getTime() - openEntry.startedAt.getTime()) / 60000);
    await prisma.sessionTimeEntry.update({
      where: { id: openEntry.id },
      data: { endedAt: now, durationMin: entryDuration },
    });
  }

  // Oblicz łączny czas pracy
  const allEntries = await prisma.sessionTimeEntry.findMany({ where: { workSessionId: id } });
  const totalWork = calcWorkMinutes(allEntries.map(e => ({ startedAt: e.startedAt, endedAt: e.endedAt ?? now })));

  const updated = await prisma.workSession.update({
    where: { id },
    data: { endedAt: now, durationMin: totalWork, notes, status: 'COMPLETED' },
    include: sessionInclude,
  });

  // Powiadom klienta
  if (session.ticketId) {
    const tech = await prisma.user.findUnique({ where: { id: techId }, select: { firstName: true, lastName: true } });
    if (tech) notifyTicketWorkCompleted(session.ticketId, `${tech.firstName} ${tech.lastName}`);
  }

  return updated;
}

// ── Mobile session ───────────────────────────────────────────────────────────

export async function startMobileSession(techId: string, data: {
  workspaceId: string;
  ticketId?: string;
  locationId?: string;
  deviceId?: string;
  notes?: string;
}) {
  // Allow multiple concurrent sessions (multitasking)
  const session = await prisma.workSession.create({
    data: {
      workspaceId: data.workspaceId,
      techId,
      ticketId: data.ticketId ?? null,
      locationId: data.locationId ?? null,
      deviceId: data.deviceId ?? null,
      notes: data.notes ?? null,
      status: 'ACTIVE',
    },
    include: sessionInclude,
  });

  // Pierwszy wpis czasu
  await prisma.sessionTimeEntry.create({
    data: { workSessionId: session.id },
  });

  // Powiadom klienta
  if (data.ticketId) {
    const tech = await prisma.user.findUnique({ where: { id: techId }, select: { firstName: true, lastName: true } });
    if (tech) notifyTicketWorkStarted(data.ticketId, `${tech.firstName} ${tech.lastName}`);
  }

  // Ponownie pobierz z entries
  return prisma.workSession.findUnique({ where: { id: session.id }, include: sessionInclude });
}

// ── Pause ────────────────────────────────────────────────────────────────────

export async function pauseSession(id: string, techId: string) {
  const session = await prisma.workSession.findFirst({
    where: { id, techId, status: 'ACTIVE' },
    include: { timeEntries: true },
  });
  if (!session) throw new AppError('Active session not found', 404);

  const now = new Date();

  // Zamknij bieżący wpis czasu
  const openEntry = session.timeEntries.find(e => !e.endedAt);
  if (openEntry) {
    const entryDuration = Math.round((now.getTime() - openEntry.startedAt.getTime()) / 60000);
    await prisma.sessionTimeEntry.update({
      where: { id: openEntry.id },
      data: { endedAt: now, durationMin: entryDuration },
    });
  }

  return prisma.workSession.update({
    where: { id },
    data: { status: 'PAUSED', pausedAt: now },
    include: sessionInclude,
  });
}

// ── Resume ───────────────────────────────────────────────────────────────────

export async function resumeSession(id: string, techId: string) {
  const session = await prisma.workSession.findFirst({
    where: { id, techId, status: 'PAUSED' },
  });
  if (!session) throw new AppError('Paused session not found', 404);

  const now = new Date();

  // Nowy wpis czasu
  await prisma.sessionTimeEntry.create({
    data: { workSessionId: id },
  });

  // Oblicz czas pauzy i dodaj do totalPausedMin
  const pausedMs = session.pausedAt ? now.getTime() - session.pausedAt.getTime() : 0;
  const pausedMin = Math.round(pausedMs / 60000);

  return prisma.workSession.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      pausedAt: null,
      totalPausedMin: { increment: pausedMin },
    },
    include: sessionInclude,
  });
}

// ── Get active session ───────────────────────────────────────────────────────

export async function getActiveTechSession(techId: string) {
  // Return ALL active/paused sessions (multitasking support)
  return prisma.workSession.findMany({
    where: { techId, status: { in: ['ACTIVE', 'PAUSED'] } },
    include: sessionInclude,
    orderBy: { startedAt: 'desc' },
  });
}

// ── Sessions by client ───────────────────────────────────────────────────────

export async function getSessionsByClient(workspaceId: string) {
  return prisma.workSession.findMany({
    where: { workspaceId },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: {
      tech: { select: { id: true, firstName: true, lastName: true } },
      device: { select: { id: true, name: true } },
      timeEntries: { orderBy: { startedAt: 'asc' } },
    },
  });
}
