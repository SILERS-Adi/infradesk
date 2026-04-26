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

    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canReceiveTickets: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds } };
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
billingRouter.use(requireAuth, requireWorkspace, requireAccess(MODULES.BILLING, "view"));

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

// GET /billing/summary?month=YYYY-MM&billingType=HOURLY|SUBSCRIPTION|HYBRID
// Per-client aggregation: hours worked × client-specific rate, plus subscription info.
billingRouter.get('/summary', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      billingType: z.enum(['HOURLY', 'SUBSCRIPTION', 'HYBRID']).optional(),
    }).parse(req.query);

    const monthStr = q.month ?? new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split('-').map(Number);
    const start = new Date(year!, month! - 1, 1);
    const end = new Date(year!, month!, 1);

    // All client relations for this MSP workspace
    const relations = await prisma.workspaceRelation.findMany({
      where: {
        providerWorkspaceId: req.workspaceId!,
        ...(q.billingType ? { billingType: q.billingType } : {}),
      },
      include: {
        client: {
          select: {
            id: true, slug: true, name: true, logoUrl: true, primaryColor: true, city: true,
          },
        },
      },
    });

    // All billable completed sessions in month for this workspace
    const sessions = await prisma.workSession.findMany({
      where: {
        workspaceId: req.workspaceId!,
        status: 'COMPLETED',
        billable: true,
        endedAt: { gte: start, lt: end },
      },
      select: {
        id: true, clientWorkspaceId: true, billableMinutes: true, durationMinutes: true,
        startedAt: true, endedAt: true, hourlyRateNet: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
        ticketLinks: { select: { ticket: { select: { id: true, ticketNumber: true } } } },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Bucket sessions by client
    const byClient = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!s.clientWorkspaceId) continue;
      const arr = byClient.get(s.clientWorkspaceId) ?? [];
      arr.push(s);
      byClient.set(s.clientWorkspaceId, arr);
    }

    // Build per-client rows
    const rows = relations.map((r) => {
      const clientSessions = byClient.get(r.clientWorkspaceId) ?? [];
      const totalMinutes = clientSessions.reduce((a, s) => a + (s.durationMinutes ?? 0), 0);
      const billableMinutes = clientSessions.reduce((a, s) => a + (s.billableMinutes ?? 0), 0);
      const billableHours = billableMinutes / 60;
      const sessionsCount = clientSessions.length;

      const relationRate = r.hourlyRateNet ? Number(r.hourlyRateNet) : null;
      const monthlyNet = r.monthlyNet ? Number(r.monthlyNet) : null;
      const includedHours = r.monthlyHours ?? null;
      const overageRate = r.overageRateNet ? Number(r.overageRateNet) : null;

      // Cost calc
      let baseCost = 0;
      let overageHours = 0;
      let overageCost = 0;
      let totalValue = 0;

      if (r.billingType === 'SUBSCRIPTION') {
        baseCost = monthlyNet ?? 0;
        if (includedHours != null) {
          overageHours = Math.max(0, billableHours - includedHours);
          overageCost = overageHours * (overageRate ?? relationRate ?? 0);
        }
        totalValue = baseCost + overageCost;
      } else if (r.billingType === 'HOURLY') {
        // Prefer snapshot rate from session, fall back to relation rate
        baseCost = clientSessions.reduce((a, s) => {
          const rate = s.hourlyRateNet ? Number(s.hourlyRateNet) : (relationRate ?? 0);
          return a + ((s.billableMinutes ?? 0) / 60) * rate;
        }, 0);
        totalValue = baseCost;
      } else {
        // HYBRID: monthly base + hourly overage above included hours
        baseCost = monthlyNet ?? 0;
        if (includedHours != null) {
          overageHours = Math.max(0, billableHours - includedHours);
          overageCost = overageHours * (overageRate ?? relationRate ?? 0);
        } else if (relationRate) {
          overageCost = billableHours * relationRate;
        }
        totalValue = baseCost + overageCost;
      }

      return {
        relationId: r.id,
        status: r.status,
        billingType: r.billingType,
        hourlyRateNet: relationRate,
        monthlyNet,
        monthlyHours: includedHours,
        overageRateNet: overageRate,
        billingIncrementMin: r.billingIncrementMin,
        client: r.client,
        sessionsCount,
        totalMinutes,
        billableMinutes,
        billableHours,
        baseCost,
        overageHours,
        overageCost,
        totalValue,
        sessions: clientSessions.map((s) => ({
          id: s.id,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationMinutes: s.durationMinutes,
          billableMinutes: s.billableMinutes,
          hourlyRateNet: s.hourlyRateNet,
          technician: s.technician,
          ticketNumbers: s.ticketLinks.map((l) => l.ticket.ticketNumber),
        })),
      };
    });

    // Sort: biggest value first
    rows.sort((a, b) => b.totalValue - a.totalValue);

    const totals = {
      clients: rows.length,
      activeContracts: rows.filter((r) => r.status === 'ACTIVE').length,
      subscriptionCount: rows.filter((r) => r.billingType === 'SUBSCRIPTION').length,
      hourlyCount: rows.filter((r) => r.billingType === 'HOURLY').length,
      hybridCount: rows.filter((r) => r.billingType === 'HYBRID').length,
      totalBillableMinutes: rows.reduce((a, r) => a + r.billableMinutes, 0),
      totalBillableHours: rows.reduce((a, r) => a + r.billableHours, 0),
      totalValue: rows.reduce((a, r) => a + r.totalValue, 0),
      totalOverageCost: rows.reduce((a, r) => a + r.overageCost, 0),
    };

    res.json({ month: monthStr, rows, totals });
  } catch (err) { next(err); }
});

export { calendarRouter, billingRouter };
export default router;
