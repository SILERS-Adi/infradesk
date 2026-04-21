import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { canTransition, type TicketStatus } from '../../utils/ticketStateMachine';

const router = Router();
router.use(requireAuth, requireWorkspace);

const startSchema = z.object({
  deviceId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  clientWorkspaceId: z.string().uuid().optional(),
  serviceMode: z.enum(['REMOTE', 'ONSITE']).default('REMOTE'),
  ticketIds: z.array(z.string().uuid()).max(50).optional(),
  notes: z.string().max(2000).optional(),
  autoStartedByGeofence: z.boolean().default(false),
  arrivalGpsLat: z.number().optional(),
  arrivalGpsLon: z.number().optional(),
  arrivalAccuracy: z.number().optional(),
});

const endSchema = z.object({
  notes: z.string().max(10_000).optional(),
  billable: z.boolean().optional(),
  aiSummary: z.string().max(5000).optional(),
  bulkCloseTicketIds: z.array(z.string().uuid()).max(50).optional(),
  bulkResolutionSummary: z.string().max(2000).optional(),
  departureGpsLat: z.number().optional(),
  departureGpsLon: z.number().optional(),
  distanceTraveledKm: z.number().optional(),
});

// GET /sessions?status=ACTIVE
router.get('/', requireAccess(MODULES.SESSIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      status: z.string().optional(),
      technicianId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.technicianId) where.technicianId = q.technicianId;
    const sessions = await prisma.workSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: q.limit,
      include: {
        technician: { select: { id: true, firstName: true, lastName: true } },
        device: { select: { id: true, name: true } },
        ticketLinks: { select: { ticketId: true, ticket: { select: { ticketNumber: true, title: true, status: true } } } },
      },
    });
    res.json({ sessions });
  } catch (err) { next(err); }
});

router.get('/current', requireAccess(MODULES.SESSIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.workSession.findFirst({
      where: { workspaceId: req.workspaceId!, technicianId: req.auth!.sub, status: 'ACTIVE' },
      include: {
        device: { select: { id: true, name: true } },
        ticketLinks: { select: { ticketId: true, ticket: { select: { id: true, ticketNumber: true, title: true, status: true } } } },
      },
    });
    res.json({ session: current });
  } catch (err) { next(err); }
});

router.post('/start', requireAccess(MODULES.SESSIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = startSchema.parse(req.body);
    // Only one ACTIVE session per technician in a workspace.
    const active = await prisma.workSession.findFirst({
      where: { workspaceId: req.workspaceId!, technicianId: req.auth!.sub, status: 'ACTIVE' },
      select: { id: true },
    });
    if (active) throw HttpError.conflict('Masz już aktywną sesję', 'session_active');

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.workSession.create({
        data: {
          workspaceId: req.workspaceId!,
          technicianId: req.auth!.sub,
          deviceId: input.deviceId,
          locationId: input.locationId,
          clientWorkspaceId: input.clientWorkspaceId,
          serviceMode: input.serviceMode,
          status: 'ACTIVE',
          startedAt: new Date(),
          notes: input.notes,
          autoStartedByGeofence: input.autoStartedByGeofence,
          arrivalGpsLat: input.arrivalGpsLat,
          arrivalGpsLon: input.arrivalGpsLon,
          arrivalAccuracy: input.arrivalAccuracy,
          timeEntries: { create: { startedAt: new Date() } },
        },
      });
      if (input.ticketIds?.length) {
        await tx.ticketSessionLink.createMany({
          data: input.ticketIds.map((ticketId) => ({ ticketId, workSessionId: s.id })),
        });
        // Auto-transition linked tickets toward IN_PROGRESS.
        // Chain OPEN → ASSIGNED → IN_PROGRESS if needed (state machine does not allow OPEN → IN_PROGRESS directly).
        const tickets = await tx.ticket.findMany({
          where: { id: { in: input.ticketIds }, workspaceId: req.workspaceId! },
          select: { id: true, status: true, assignedToUserId: true, firstResponseAt: true },
        });
        for (const t of tickets) {
          let current = t.status as TicketStatus;
          const updates: Record<string, unknown> = {};
          if (current === 'OPEN' && canTransition(current, 'ASSIGNED')) {
            updates.status = 'ASSIGNED';
            if (!t.assignedToUserId) updates.assignedToUserId = req.auth!.sub;
            await tx.ticketEvent.create({
              data: { ticketId: t.id, userId: req.auth!.sub, eventType: 'status_changed', fromValue: current, toValue: 'ASSIGNED', metadata: { reason: 'session_started', sessionId: s.id } },
            });
            current = 'ASSIGNED';
          }
          if (canTransition(current, 'IN_PROGRESS')) {
            updates.status = 'IN_PROGRESS';
            if (!t.firstResponseAt) updates.firstResponseAt = new Date();
            await tx.ticketEvent.create({
              data: { ticketId: t.id, userId: req.auth!.sub, eventType: 'status_changed', fromValue: current, toValue: 'IN_PROGRESS', metadata: { reason: 'session_started', sessionId: s.id } },
            });
          }
          if (Object.keys(updates).length > 0) {
            await tx.ticket.update({ where: { id: t.id }, data: updates });
          }
        }
      }
      return s;
    });
    res.status(201).json({ session });
  } catch (err) { next(err); }
});

router.post('/:id/pause', requireAccess(MODULES.SESSIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await prisma.workSession.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, technicianId: req.auth!.sub },
      include: { timeEntries: { where: { endedAt: null }, orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    if (!s) throw HttpError.notFound();
    if (s.status !== 'ACTIVE') throw HttpError.badRequest('Sesja nie jest aktywna', 'not_active');

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const open = s.timeEntries[0];
      if (open) {
        const minutes = Math.round((now.getTime() - open.startedAt.getTime()) / 60_000);
        await tx.sessionTimeEntry.update({ where: { id: open.id }, data: { endedAt: now, durationMinutes: minutes } });
      }
      return tx.workSession.update({ where: { id: s.id }, data: { status: 'PAUSED' } });
    });
    res.json({ session: updated });
  } catch (err) { next(err); }
});

router.post('/:id/resume', requireAccess(MODULES.SESSIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await prisma.workSession.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, technicianId: req.auth!.sub },
      select: { id: true, status: true },
    });
    if (!s) throw HttpError.notFound();
    if (s.status !== 'PAUSED') throw HttpError.badRequest('Sesja nie jest wstrzymana', 'not_paused');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.sessionTimeEntry.create({ data: { workSessionId: s.id, startedAt: new Date() } });
      return tx.workSession.update({ where: { id: s.id }, data: { status: 'ACTIVE' } });
    });
    res.json({ session: updated });
  } catch (err) { next(err); }
});

router.post('/:id/end', requireAccess(MODULES.SESSIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = endSchema.parse(req.body);
    const s = await prisma.workSession.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, technicianId: req.auth!.sub },
      include: { timeEntries: true, ticketLinks: { select: { ticketId: true } } },
    });
    if (!s) throw HttpError.notFound();
    if (s.status === 'COMPLETED') throw HttpError.badRequest('Sesja już zakończona', 'already_completed');

    const now = new Date();

    const completed = await prisma.$transaction(async (tx) => {
      // Close any open time entry.
      const open = s.timeEntries.find((e) => !e.endedAt);
      if (open) {
        const minutes = Math.round((now.getTime() - open.startedAt.getTime()) / 60_000);
        await tx.sessionTimeEntry.update({ where: { id: open.id }, data: { endedAt: now, durationMinutes: minutes } });
      }
      // Sum durations (re-read after update).
      const entries = await tx.sessionTimeEntry.findMany({ where: { workSessionId: s.id } });
      const totalMin = entries.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);

      const updated = await tx.workSession.update({
        where: { id: s.id },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          durationMinutes: totalMin,
          billableMinutes: input.billable === false ? 0 : totalMin,
          notes: input.notes ?? s.notes,
          aiSummary: input.aiSummary ?? s.aiSummary,
          departureGpsLat: input.departureGpsLat,
          departureGpsLon: input.departureGpsLon,
          distanceTraveledKm: input.distanceTraveledKm,
        },
      });

      // Bulk close tickets requested by the user.
      // Walk the state machine forward toward RESOLVED — handle any legal starting state
      // (OPEN → ASSIGNED → IN_PROGRESS → RESOLVED).
      if (input.bulkCloseTicketIds?.length) {
        const tickets = await tx.ticket.findMany({
          where: { id: { in: input.bulkCloseTicketIds }, workspaceId: req.workspaceId!, deletedAt: null },
          select: { id: true, status: true, firstResponseAt: true },
        });
        const chain: TicketStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];
        for (const t of tickets) {
          const origin = t.status as TicketStatus;
          let current = origin;
          for (const target of chain) {
            if (current === target) continue;
            if (!canTransition(current, target)) continue;
            const data: Record<string, unknown> = { status: target };
            if (target === 'RESOLVED') {
              data.resolvedAt = now;
              data.resolvedByUserId = req.auth!.sub;
              if (input.bulkResolutionSummary) data.resolutionSummary = input.bulkResolutionSummary;
            }
            if (!t.firstResponseAt) data.firstResponseAt = now;
            await tx.ticket.update({ where: { id: t.id }, data });
            await tx.ticketEvent.create({
              data: { ticketId: t.id, userId: req.auth!.sub, eventType: 'status_changed', fromValue: current, toValue: target, metadata: { reason: 'session_bulk_close', sessionId: s.id } },
            });
            current = target;
            if (target === 'RESOLVED') break;
          }
        }
      }
      return updated;
    });

    res.json({ session: completed });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.SESSIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await prisma.workSession.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      include: {
        technician: { select: { id: true, firstName: true, lastName: true } },
        device: { select: { id: true, name: true } },
        timeEntries: { orderBy: { startedAt: 'asc' } },
        ticketLinks: { include: { ticket: { select: { id: true, ticketNumber: true, title: true, status: true } } } },
      },
    });
    if (!s) throw HttpError.notFound();
    res.json({ session: s });
  } catch (err) { next(err); }
});

export default router;
