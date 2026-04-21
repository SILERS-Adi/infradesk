import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  assignedToUserId: z.string().uuid(),
  clientWorkspaceId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime(),
  estimatedHours: z.number().positive().max(24).optional(),
  distanceKm: z.number().nonnegative().optional(),
  vehicleLicensePlate: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
});

async function nextDelegationNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DEL-${year}-`;
  return prisma.$transaction(async (tx) => {
    const last = await tx.delegation.findFirst({
      where: { workspaceId, delegationNumber: { startsWith: prefix } },
      orderBy: { delegationNumber: 'desc' },
      select: { delegationNumber: true },
    });
    let n = 1;
    if (last) {
      const m = last.delegationNumber.match(/-(\d+)$/);
      if (m) n = parseInt(m[1]!, 10) + 1;
    }
    return `${prefix}${String(n).padStart(4, '0')}`;
  });
}

router.get('/', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      status: z.string().optional(),
      assignedToUserId: z.string().uuid().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(req.query);

    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.assignedToUserId) where.assignedToUserId = q.assignedToUserId;
    if (q.from || q.to) {
      const dateFilter: Record<string, Date> = {};
      if (q.from) dateFilter.gte = new Date(q.from);
      if (q.to) dateFilter.lte = new Date(q.to);
      where.scheduledAt = dateFilter;
    }

    const items = await prisma.delegation.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const m = await prisma.membership.findFirst({
      where: { userId: input.assignedToUserId, workspaceId: req.workspaceId!, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) throw HttpError.badRequest('Assignee nie jest członkiem workspace', 'invalid_assignee');
    const delegationNumber = await nextDelegationNumber(req.workspaceId!);
    const d = await prisma.delegation.create({
      data: {
        workspaceId: req.workspaceId!,
        delegationNumber,
        title: input.title,
        description: input.description,
        assignedToUserId: input.assignedToUserId,
        clientWorkspaceId: input.clientWorkspaceId,
        locationId: input.locationId,
        scheduledAt: new Date(input.scheduledAt),
        estimatedHours: input.estimatedHours,
        distanceKm: input.distanceKm,
        vehicleLicensePlate: input.vehicleLicensePlate,
        notes: input.notes,
        createdByUserId: req.auth!.sub,
      },
    });
    res.status(201).json({ delegation: d });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const d = await prisma.delegation.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!d) throw HttpError.notFound();
    res.json({ delegation: d });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.delegation.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const data: Record<string, unknown> = { ...input };
    if (input.scheduledAt) data.scheduledAt = new Date(input.scheduledAt);
    const d = await prisma.delegation.update({ where: { id: existing.id }, data });
    res.json({ delegation: d });
  } catch (err) { next(err); }
});

router.post('/:id/status', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = statusSchema.parse(req.body);
    const existing = await prisma.delegation.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const d = await prisma.delegation.update({ where: { id: existing.id }, data: { status: input.status } });
    res.json({ delegation: d });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.delegation.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.delegation.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────
// Calendar feed — combines Tasks + Delegations + WorkSessions
// ────────────────────────────────────────────────────────────────
const calendarRouter = Router();
calendarRouter.use(requireAuth, requireWorkspace);

calendarRouter.get('/events', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      userId: z.string().uuid().optional(),
    }).parse(req.query);

    const fromDate = q.from ? new Date(q.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = q.to ? new Date(q.to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const userFilter = q.userId ? { assignedToUserId: q.userId } : {};

    const [tasks, delegations, sessions] = await Promise.all([
      prisma.task.findMany({
        where: {
          workspaceId: req.workspaceId!,
          scheduledAt: { gte: fromDate, lte: toDate },
          ...userFilter,
        },
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.delegation.findMany({
        where: {
          workspaceId: req.workspaceId!,
          scheduledAt: { gte: fromDate, lte: toDate },
          ...userFilter,
        },
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.workSession.findMany({
        where: {
          workspaceId: req.workspaceId!,
          startedAt: { gte: fromDate, lte: toDate },
          ...(q.userId ? { technicianId: q.userId } : {}),
        },
        include: { technician: { select: { id: true, firstName: true, lastName: true } }, device: { select: { name: true } } },
      }),
    ]);

    const events = [
      ...tasks.map((t) => ({
        id: `task:${t.id}`,
        kind: 'task',
        title: `${t.taskNumber} · ${t.title}`,
        start: t.scheduledAt!.toISOString(),
        end: t.scheduledAt && t.estimatedMinutes
          ? new Date(t.scheduledAt.getTime() + t.estimatedMinutes * 60_000).toISOString()
          : undefined,
        color: t.status === 'DONE' ? 'var(--ok)' : t.priority === 'CRITICAL' ? 'var(--er)' : 'var(--pri)',
        assignee: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : null,
        href: `/tasks#${t.id}`,
      })),
      ...delegations.map((d) => ({
        id: `delegation:${d.id}`,
        kind: 'delegation',
        title: `${d.delegationNumber} · ${d.title}`,
        start: d.scheduledAt.toISOString(),
        end: d.estimatedHours
          ? new Date(d.scheduledAt.getTime() + d.estimatedHours * 3_600_000).toISOString()
          : undefined,
        color: d.status === 'DONE' ? 'var(--ok)' : 'var(--wn)',
        assignee: `${d.assignedTo.firstName} ${d.assignedTo.lastName}`,
        href: `/delegations#${d.id}`,
      })),
      ...sessions.map((s) => ({
        id: `session:${s.id}`,
        kind: 'session',
        title: `${s.device?.name ?? 'Sesja'} · ${s.durationMinutes ?? '…'} min`,
        start: s.startedAt.toISOString(),
        end: s.endedAt?.toISOString(),
        color: s.status === 'ACTIVE' ? 'var(--pri)' : 'var(--tx3)',
        assignee: `${s.technician.firstName} ${s.technician.lastName}`,
        href: `/sessions#${s.id}`,
      })),
    ];

    res.json({ events, range: { from: fromDate, to: toDate } });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────
// Billing — time × rate aggregation
// ────────────────────────────────────────────────────────────────
const billingRouter = Router();
billingRouter.use(requireAuth, requireWorkspace);

billingRouter.get('/time', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      technicianId: z.string().uuid().optional(),
    }).parse(req.query);

    const monthStr = q.month ?? new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year!, month! - 1, 1);
    const end = new Date(year!, month!, 1);

    const where: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      status: 'COMPLETED',
      billable: true,
      endedAt: { gte: start, lt: end },
    };
    if (q.technicianId) where.technicianId = q.technicianId;

    const sessions = await prisma.workSession.findMany({
      where,
      select: {
        id: true, technicianId: true, billableMinutes: true, durationMinutes: true,
        startedAt: true, endedAt: true, hourlyRateNet: true, notes: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
        ticketLinks: { select: { ticket: { select: { id: true, ticketNumber: true, title: true } } } },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Aggregate per technician
    const perTech = new Map<string, {
      technicianId: string;
      technicianName: string;
      totalMinutes: number;
      billableMinutes: number;
      sessionsCount: number;
      estimatedAmountPln: number;
    }>();

    for (const s of sessions) {
      const key = s.technicianId;
      const existing = perTech.get(key) ?? {
        technicianId: key,
        technicianName: `${s.technician.firstName} ${s.technician.lastName}`,
        totalMinutes: 0,
        billableMinutes: 0,
        sessionsCount: 0,
        estimatedAmountPln: 0,
      };
      existing.totalMinutes += s.durationMinutes ?? 0;
      existing.billableMinutes += s.billableMinutes ?? 0;
      existing.sessionsCount += 1;
      if (s.hourlyRateNet) {
        existing.estimatedAmountPln += ((s.billableMinutes ?? 0) / 60) * Number(s.hourlyRateNet);
      }
      perTech.set(key, existing);
    }

    res.json({
      month: monthStr,
      technicians: Array.from(perTech.values()),
      sessions,
      totalSessions: sessions.length,
      totalMinutes: sessions.reduce((a, s) => a + (s.durationMinutes ?? 0), 0),
      totalBillableMinutes: sessions.reduce((a, s) => a + (s.billableMinutes ?? 0), 0),
      totalEstimatedPln: Array.from(perTech.values()).reduce((a, t) => a + t.estimatedAmountPln, 0),
    });
  } catch (err) { next(err); }
});

export { calendarRouter, billingRouter };
export default router;
