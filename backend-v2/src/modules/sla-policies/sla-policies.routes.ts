// P2: SlaPolicy CRUD — admin może definiować / aktualizować policy per priority.
// Bez tego SLA na ticketach polega na DEFAULT_SLA z tickets.service.ts.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import { HttpError } from '../../utils/httpError';

const router = Router();
router.use(requireAuth, requireWorkspace);

const policySchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  responseTimeMin: z.number().int().min(1).max(43200), // do 30 dni
  resolveTimeMin: z.number().int().min(1).max(43200),
  businessHoursOnly: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
});

// GET /sla-policies — lista
router.get('/', requireAccess(MODULES.WORKSPACE_SETTINGS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await prisma.slaPolicy.findMany({
      where: { workspaceId: req.workspaceId! },
      orderBy: [{ priority: 'asc' }],
    });
    res.json({ policies });
  } catch (err) { next(err); }
});

// POST /sla-policies — create lub upsert (per workspace+priority unique)
router.post('/', requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = policySchema.parse(req.body);
    const policy = await prisma.slaPolicy.upsert({
      where: { workspaceId_priority: { workspaceId: req.workspaceId!, priority: input.priority } },
      create: { ...input, workspaceId: req.workspaceId! },
      update: input,
    });
    res.status(201).json({ policy });
  } catch (err) { next(err); }
});

// PATCH /sla-policies/:id
router.patch('/:id', requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = policySchema.partial().parse(req.body);
    const existing = await prisma.slaPolicy.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const policy = await prisma.slaPolicy.update({ where: { id: existing.id }, data: input });
    res.json({ policy });
  } catch (err) { next(err); }
});

// DELETE /sla-policies/:id
router.delete('/:id', requireAccess(MODULES.WORKSPACE_SETTINGS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.slaPolicy.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.slaPolicy.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /sla-policies/seed-defaults — utwórz 4 domyślne policies dla workspace
router.post('/seed-defaults', requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const defaults = [
      { name: 'Krytyczne', priority: 'CRITICAL' as const, responseTimeMin: 30, resolveTimeMin: 240, isDefault: true },
      { name: 'Wysokie',   priority: 'HIGH' as const,     responseTimeMin: 60, resolveTimeMin: 480, isDefault: true },
      { name: 'Średnie',   priority: 'MEDIUM' as const,   responseTimeMin: 240, resolveTimeMin: 1440, isDefault: true },
      { name: 'Niskie',    priority: 'LOW' as const,      responseTimeMin: 480, resolveTimeMin: 2880, isDefault: true },
    ];
    const seeded: Array<unknown> = [];
    for (const d of defaults) {
      const policy = await prisma.slaPolicy.upsert({
        where: { workspaceId_priority: { workspaceId: req.workspaceId!, priority: d.priority } },
        create: { ...d, workspaceId: req.workspaceId!, businessHoursOnly: false },
        update: {}, // nie nadpisuj jeśli istnieje
      });
      seeded.push(policy);
    }
    res.json({ seeded: seeded.length });
  } catch (err) { next(err); }
});

export default router;
