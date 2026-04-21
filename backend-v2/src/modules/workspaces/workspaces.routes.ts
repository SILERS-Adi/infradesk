import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();

const createSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  type: z.enum(['MSP', 'CLIENT', 'INTERNAL_IT']).default('MSP'),
});

router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.auth!.sub, status: 'ACTIVE' },
      select: {
        id: true, role: true, scope: true, isDefault: true,
        workspace: { select: { id: true, slug: true, name: true, type: true, plan: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ workspaces: memberships });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const dup = await prisma.workspace.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (dup) throw HttpError.conflict('Slug jest zajęty', 'slug_taken');
    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { ...input, plan: 'STARTER' } });
      await tx.membership.create({
        data: {
          userId: req.auth!.sub, workspaceId: ws.id,
          role: 'OWNER', scope: 'FULL', isDefault: false, status: 'ACTIVE',
        },
      });
      return ws;
    });
    res.status(201).json({ workspace });
  } catch (err) { next(err); }
});

router.get('/current', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ws = await prisma.workspace.findUnique({ where: { id: req.workspaceId! } });
    res.json({ workspace: ws });
  } catch (err) { next(err); }
});

router.patch(
  '/current',
  requireAuth,
  requireWorkspace,
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        name: z.string().min(2).max(120).trim().optional(),
        taxId: z.string().optional(),
      });
      const input = schema.parse(req.body);
      const ws = await prisma.workspace.update({ where: { id: req.workspaceId! }, data: input });
      res.json({ workspace: ws });
    } catch (err) { next(err); }
  },
);

export default router;
