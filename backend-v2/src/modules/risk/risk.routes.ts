import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import { HttpError } from '../../utils/httpError';
import * as service from './risk.service';

const router = Router();
router.use(requireAuth, requireWorkspace);

router.get('/', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scores = await service.latestForAllClients(req.workspaceId!);
    res.json({ scores });
  } catch (err) { next(err); }
});

router.get('/:clientId', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = await prisma.clientRiskScore.findFirst({
      where: { workspaceId: req.workspaceId!, clientWorkspaceId: String(req.params.clientId) },
      orderBy: { computedAt: 'desc' },
    });
    if (!latest) {
      const computed = await service.computeScore(req.workspaceId!, String(req.params.clientId));
      res.json({ score: computed.score, breakdown: computed.breakdown, factors: computed.factors, persisted: false });
      return;
    }
    res.json({ score: latest.score, trend7d: latest.trend7d, breakdown: latest.components, factors: latest.factors, computedAt: latest.computedAt, persisted: true });
  } catch (err) { next(err); }
});

router.get('/:clientId/history', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }).parse(req.query);
    const since = new Date(Date.now() - q.days * 24 * 60 * 60 * 1000);
    const history = await prisma.clientRiskScore.findMany({
      where: { workspaceId: req.workspaceId!, clientWorkspaceId: String(req.params.clientId), computedAt: { gte: since } },
      orderBy: { computedAt: 'asc' },
      select: { score: true, trend7d: true, computedAt: true },
    });
    res.json({ history });
  } catch (err) { next(err); }
});

const recomputeSchema = z.object({ clientWorkspaceId: z.string().uuid() });

router.post('/recompute', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = recomputeSchema.parse(req.body);
    // Sanity: requester's workspace must have a MSP relation with that client (or it's same workspace).
    const allowed = input.clientWorkspaceId === req.workspaceId! ||
      await prisma.workspaceRelation.findFirst({
        where: { providerWorkspaceId: req.workspaceId!, clientWorkspaceId: input.clientWorkspaceId },
        select: { id: true },
      });
    if (!allowed) throw HttpError.forbidden('Brak relacji z tym klientem');
    const row = await service.persistScore(req.workspaceId!, input.clientWorkspaceId);
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
