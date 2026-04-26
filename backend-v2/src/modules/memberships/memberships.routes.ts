import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
  scope: z.enum(['FULL', 'SCOPED']).default('FULL'),
  workspaceId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
  scope: z.enum(['FULL', 'SCOPED']).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'REVOKED']).optional(),
});

async function resolveTargetWs(req: Request, overrideWsId: string | undefined): Promise<string> {
  const target = overrideWsId ?? req.workspaceId!;
  if (overrideWsId && overrideWsId !== req.workspaceId) {
    const rel = await prisma.workspaceRelation.findFirst({
      where: { providerWorkspaceId: req.workspaceId!, clientWorkspaceId: overrideWsId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!rel) throw HttpError.forbidden('Brak aktywnej relacji z klientem');
  }
  return target;
}

router.get(
  '/',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = z.object({ workspaceId: z.string().uuid().optional() }).parse(req.query);
      const targetWs = await resolveTargetWs(req, q.workspaceId);
      const list = await prisma.membership.findMany({
        where: { workspaceId: targetWs },
        select: {
          id: true, role: true, scope: true, status: true, isDefault: true, createdAt: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true, isActive: true, twoFactorEnabled: true, lastLoginAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ memberships: list });
    } catch (err) { next(err); }
  },
);

router.post(
  '/invite',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = inviteSchema.parse(req.body);
      const targetWs = await resolveTargetWs(req, input.workspaceId);
      let user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: input.email, firstName: input.firstName, lastName: input.lastName,
            passwordHash: 'PENDING_INVITE',
            isActive: false,
          },
          select: { id: true },
        });
      }
      const existing = await prisma.membership.findFirst({
        where: { userId: user.id, workspaceId: targetWs },
        select: { id: true },
      });
      if (existing) throw HttpError.conflict('Użytkownik jest już członkiem', 'already_member');
      const m = await prisma.membership.create({
        data: {
          userId: user.id, workspaceId: targetWs,
          role: input.role, scope: input.scope, status: 'INVITED',
        },
      });
      res.status(201).json({ membership: m });
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateSchema.parse(req.body);
      // Allow editing memberships in own workspace OR in linked client workspace.
      const relations = await prisma.workspaceRelation.findMany({
        where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
        select: { clientWorkspaceId: true },
      });
      const editableWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
      const found = await prisma.membership.findFirst({
        where: { id: String(req.params.id), workspaceId: { in: editableWsIds } },
        select: { id: true, userId: true, role: true, workspaceId: true },
      });
      if (!found) throw HttpError.notFound('Membership not found');
      if (found.userId === req.auth!.sub && input.role && input.role !== found.role) {
        throw HttpError.forbidden('Nie można zmienić własnej roli');
      }
      const updated = await prisma.membership.update({ where: { id: found.id }, data: input });
      res.json({ membership: updated });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const relations = await prisma.workspaceRelation.findMany({
        where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
        select: { clientWorkspaceId: true },
      });
      const editableWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
      const found = await prisma.membership.findFirst({
        where: { id: String(req.params.id), workspaceId: { in: editableWsIds } },
        select: { id: true, userId: true, role: true, workspaceId: true },
      });
      if (!found) throw HttpError.notFound('Membership not found');
      if (found.userId === req.auth!.sub) throw HttpError.forbidden('Nie można usunąć samego siebie');
      if (found.role === 'OWNER') {
        const otherOwners = await prisma.membership.count({
          where: { workspaceId: found.workspaceId, role: 'OWNER', NOT: { id: found.id } },
        });
        if (otherOwners === 0) throw HttpError.forbidden('Workspace musi mieć przynajmniej jednego OWNER-a');
      }
      await prisma.membership.update({ where: { id: found.id }, data: { status: 'REVOKED' } });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

export default router;
