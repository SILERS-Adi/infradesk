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
        taxId: z.string().max(50).nullable().optional(),
        regon: z.string().max(50).nullable().optional(),
        krs: z.string().max(50).nullable().optional(),
        logoUrl: z.string().url().max(500).nullable().optional(),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        locale: z.string().max(10).optional(),
        timezone: z.string().max(60).optional(),
        currency: z.string().length(3).optional(),
        addressLine1: z.string().max(200).nullable().optional(),
        addressLine2: z.string().max(200).nullable().optional(),
        postalCode: z.string().max(20).nullable().optional(),
        city: z.string().max(120).nullable().optional(),
        country: z.string().length(2).optional(),
        email: z.string().email().max(200).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        website: z.string().url().max(300).nullable().optional(),
      });
      const input = schema.parse(req.body);
      const ws = await prisma.workspace.update({ where: { id: req.workspaceId! }, data: input });
      res.json({ workspace: ws });
    } catch (err) { next(err); }
  },
);

export default router;
