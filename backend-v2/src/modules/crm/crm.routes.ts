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
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(40).optional(),
  mobile: z.string().max(40).optional(),
  position: z.string().max(120).optional(),
  clientWorkspaceId: z.string().uuid().optional(),
  isMainContact: z.boolean().default(false),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});
const updateSchema = createSchema.partial();

router.get('/', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      search: z.string().max(120).optional(),
      clientWorkspaceId: z.string().uuid().optional(),
      tag: z.string().max(50).optional(),
    }).parse(req.query);
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds } };
    if (q.clientWorkspaceId) where.clientWorkspaceId = q.clientWorkspaceId;
    if (q.tag) where.tags = { has: q.tag };
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search, mode: 'insensitive' } },
        { lastName: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
      ];
    }
    const contacts = await prisma.contact.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    res.json({ contacts });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.isMainContact && input.clientWorkspaceId) {
      await prisma.contact.updateMany({
        where: { workspaceId: req.workspaceId!, clientWorkspaceId: input.clientWorkspaceId, isMainContact: true },
        data: { isMainContact: false },
      });
    }
    const c = await prisma.contact.create({ data: { ...input, workspaceId: req.workspaceId! } });
    res.status(201).json({ contact: c });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await prisma.contact.findFirst({ where: { id: String(req.params.id), workspaceId: req.workspaceId! } });
    if (!c) throw HttpError.notFound();
    res.json({ contact: c });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.contact.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, clientWorkspaceId: true },
    });
    if (!existing) throw HttpError.notFound();
    if (input.isMainContact && (input.clientWorkspaceId ?? existing.clientWorkspaceId)) {
      await prisma.contact.updateMany({
        where: {
          workspaceId: req.workspaceId!,
          clientWorkspaceId: input.clientWorkspaceId ?? existing.clientWorkspaceId!,
          isMainContact: true,
          NOT: { id: existing.id },
        },
        data: { isMainContact: false },
      });
    }
    const c = await prisma.contact.update({ where: { id: existing.id }, data: input });
    res.json({ contact: c });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.CLIENTS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contact.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.contact.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
