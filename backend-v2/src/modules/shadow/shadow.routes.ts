import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import { HttpError } from '../../utils/httpError';
import * as service from './shadow.service';

const router = Router();
router.use(requireAuth, requireWorkspace);

router.get('/', requireAccess(MODULES.AI_COPILOT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      feature: z.string().max(80).optional(),
      matched: z.enum(['true', 'false', 'null']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.feature) where.feature = q.feature;
    if (q.matched === 'true') where.matched = true;
    else if (q.matched === 'false') where.matched = false;
    else if (q.matched === 'null') where.matched = null;
    const items = await prisma.shadowDecision.findMany({
      where, orderBy: { createdAt: 'desc' }, take: q.limit,
    });
    res.json({ items });
  } catch (err) { next(err); }
});

router.get('/report', requireAccess(MODULES.AI_COPILOT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
    const report = await service.weeklyReport(req.workspaceId!, q.days);
    res.json(report);
  } catch (err) { next(err); }
});

const recordSchema = z.object({
  feature: z.string().min(2).max(80),
  input: z.any(),
  aiOutput: z.any(),
  estimatedValuePln: z.number().optional(),
  linkedTicketId: z.string().uuid().optional(),
  linkedSessionId: z.string().uuid().optional(),
});

router.post('/record', requireAccess(MODULES.AI_COPILOT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = recordSchema.parse(req.body);
    const result = await service.recordDecision({ workspaceId: req.workspaceId!, ...input });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

const resolveSchema = z.object({ humanOutput: z.any() });

router.post('/:id/resolve', requireAccess(MODULES.AI_COPILOT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = resolveSchema.parse(req.body);
    const rec = await prisma.shadowDecision.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!rec) throw HttpError.notFound();
    await service.resolveDecision({ id: rec.id, workspaceId: req.workspaceId!, humanOutput: input.humanOutput });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
