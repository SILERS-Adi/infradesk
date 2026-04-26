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
  title: z.string().min(3).max(200).trim(),
  description: z.string().max(10_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedToUserId: z.string().uuid().optional().nullable(),
  linkedTicketId: z.string().uuid().optional().nullable(),
  clientWorkspaceId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  deviceId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  travelKm: z.number().nonnegative().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
});

async function nextTaskNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TSK-${year}-`;
  return prisma.$transaction(async (tx) => {
    const last = await tx.task.findFirst({
      where: { workspaceId, taskNumber: { startsWith: prefix } },
      orderBy: { taskNumber: 'desc' },
      select: { taskNumber: true },
    });
    let n = 1;
    if (last) {
      const m = last.taskNumber.match(/-(\d+)$/);
      if (m) n = parseInt(m[1]!, 10) + 1;
    }
    return `${prefix}${String(n).padStart(4, '0')}`;
  });
}

// GET /tasks — list with filters
router.get('/', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      status: z.string().optional(),
      assignedToUserId: z.string().uuid().optional(),
      scheduled: z.enum(['today', 'week', 'unscheduled']).optional(),
      search: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds } };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.assignedToUserId) where.assignedToUserId = q.assignedToUserId;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { taskNumber: { contains: q.search.toUpperCase() } },
      ];
    }
    if (q.scheduled === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    } else if (q.scheduled === 'week') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.scheduledAt = { gte: start, lte: end };
    } else if (q.scheduled === 'unscheduled') {
      where.scheduledAt = null;
    }

    const items = await prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: q.limit,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, title: true } },
      },
    });
    res.json({ items });
  } catch (err) { next(err); }
});

// POST /tasks
router.post('/', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.linkedTicketId) {
      const t = await prisma.ticket.findFirst({
        where: { id: input.linkedTicketId, workspaceId: req.workspaceId!, deletedAt: null },
        select: { id: true },
      });
      if (!t) throw HttpError.badRequest('Ticket nie należy do workspace', 'invalid_ticket');
    }
    const taskNumber = await nextTaskNumber(req.workspaceId!);
    const task = await prisma.task.create({
      data: {
        workspaceId: req.workspaceId!,
        taskNumber,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assignedToUserId: input.assignedToUserId ?? null,
        linkedTicketId: input.linkedTicketId ?? null,
        clientWorkspaceId: input.clientWorkspaceId ?? null,
        locationId: input.locationId ?? null,
        deviceId: input.deviceId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        estimatedMinutes: input.estimatedMinutes,
        travelKm: input.travelKm,
        createdByUserId: req.auth!.sub,
      },
    });
    res.status(201).json({ task });
  } catch (err) { next(err); }
});

// GET /tasks/:id
router.get('/:id', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.task.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      },
    });
    if (!t) throw HttpError.notFound();
    res.json({ task: t });
  } catch (err) { next(err); }
});

// PATCH /tasks/:id
router.patch('/:id', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const data: Record<string, unknown> = { ...input };
    if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const task = await prisma.task.update({ where: { id: existing.id }, data });
    res.json({ task });
  } catch (err) { next(err); }
});

// POST /tasks/:id/status
router.post('/:id/status', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = statusSchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const data: Record<string, unknown> = { status: input.status };
    if (input.status === 'DONE') data.completedAt = new Date();
    const task = await prisma.task.update({ where: { id: existing.id }, data });
    res.json({ task });
  } catch (err) { next(err); }
});

// DELETE /tasks/:id
router.delete('/:id', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.task.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.task.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
