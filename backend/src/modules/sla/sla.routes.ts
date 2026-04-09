import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace, withWorkspaceMembership);

const slaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  responseTimeH: z.number().int().min(1).max(720),
  resolveTimeH: z.number().int().min(1).max(720),
  isDefault: z.boolean().optional(),
});

// GET /api/sla — list SLA policies for workspace
router.get('/', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await prisma.slaPolicy.findMany({
      where: { workspaceId: req.workspaceId! },
      orderBy: { priority: 'asc' },
    });
    res.json(policies);
  } catch (err) { next(err); }
});

// POST /api/sla — create SLA policy
router.post('/', authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = slaPolicySchema.parse(req.body);
    const policy = await prisma.slaPolicy.create({
      data: { ...data, workspaceId: req.workspaceId! },
    });
    res.status(201).json(policy);
  } catch (err) { next(err); }
});

// PUT /api/sla/:id — update SLA policy
router.put('/:id', authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.slaPolicy.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== req.workspaceId) {
      res.status(404).json({ error: 'SLA policy not found' }); return;
    }
    const data = slaPolicySchema.partial().parse(req.body);
    const updated = await prisma.slaPolicy.update({ where: { id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/sla/:id — delete SLA policy
router.delete('/:id', authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.slaPolicy.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== req.workspaceId) {
      res.status(404).json({ error: 'SLA policy not found' }); return;
    }
    await prisma.slaPolicy.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/sla/seed-defaults — create default SLA policies
router.post('/seed-defaults', authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const defaults = [
      { priority: 'LOW' as const, name: 'Niski priorytet', responseTimeH: 24, resolveTimeH: 72 },
      { priority: 'MEDIUM' as const, name: 'Średni priorytet', responseTimeH: 8, resolveTimeH: 24 },
      { priority: 'HIGH' as const, name: 'Wysoki priorytet', responseTimeH: 4, resolveTimeH: 8 },
      { priority: 'CRITICAL' as const, name: 'Krytyczny', responseTimeH: 1, resolveTimeH: 4 },
    ];

    const created = [];
    for (const d of defaults) {
      const existing = await prisma.slaPolicy.findUnique({
        where: { workspaceId_priority: { workspaceId: wsId, priority: d.priority } },
      });
      if (!existing) {
        created.push(await prisma.slaPolicy.create({
          data: { ...d, workspaceId: wsId, isDefault: true },
        }));
      }
    }
    res.json({ created: created.length, policies: created });
  } catch (err) { next(err); }
});

// GET /api/sla/stats — SLA compliance stats
router.get('/stats', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;

    const [total, breached, nearBreach] = await Promise.all([
      prisma.ticket.count({
        where: { workspaceId: wsId, status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] }, dueAt: { not: null } },
      }),
      prisma.ticket.count({
        where: { workspaceId: wsId, slaBreached: true },
      }),
      prisma.ticket.count({
        where: {
          workspaceId: wsId,
          status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'] },
          dueAt: { not: null, lt: new Date(Date.now() + 4 * 60 * 60 * 1000) }, // due in <4h
        },
      }),
    ]);

    const compliancePct = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

    res.json({ total, breached, nearBreach, compliancePct });
  } catch (err) { next(err); }
});

export default router;
