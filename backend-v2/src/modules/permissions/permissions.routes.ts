import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess, loadMembershipContext } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES, effectiveLevel, visibleModules } from '../../utils/canAccess';

const router = Router();

const overrideSchema = z.object({
  moduleKey: z.string().min(2).max(60),
  level: z.enum(['NONE', 'VIEW', 'EDIT', 'DELETE']),
});

const grantSchema = z.object({
  resourceType: z.enum(['DEVICE', 'LOCATION', 'CLIENT_WORKSPACE']),
  resourceId: z.string().uuid(),
  level: z.enum(['VIEW', 'EDIT', 'DELETE']),
});

// Current user's effective permissions within the active workspace.
router.get('/me', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const modules: Record<string, string> = {};
    for (const key of Object.values(MODULES)) modules[key] = effectiveLevel(ctx, key);
    res.json({
      role: ctx.role,
      scope: ctx.scope,
      overrides: ctx.overrides,
      grants: ctx.grants,
      effective: modules,
      visible: visibleModules(ctx),
    });
  } catch (err) { next(err); }
});

router.get(
  '/:membershipId/overrides',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true, overrides: true, grants: true },
      });
      if (!m) throw HttpError.notFound();
      res.json({ overrides: m.overrides, grants: m.grants });
    } catch (err) { next(err); }
  },
);

router.put(
  '/:membershipId/overrides',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = z.object({ overrides: z.array(overrideSchema) }).parse(req.body);
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!m) throw HttpError.notFound();
      await prisma.$transaction([
        prisma.permissionOverride.deleteMany({ where: { membershipId: m.id } }),
        prisma.permissionOverride.createMany({
          data: input.overrides.map((o) => ({ membershipId: m.id, moduleKey: o.moduleKey, level: o.level })),
        }),
      ]);
      res.json({ success: true, count: input.overrides.length });
    } catch (err) { next(err); }
  },
);

router.post(
  '/:membershipId/grants',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = grantSchema.parse(req.body);
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!m) throw HttpError.notFound();
      const grant = await prisma.accessGrant.create({
        data: { membershipId: m.id, ...input },
      });
      res.status(201).json({ grant });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:membershipId/grants/:grantId',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.accessGrant.deleteMany({
        where: { id: String(req.params.grantId), membership: { id: String(req.params.membershipId), workspaceId: req.workspaceId! } },
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

export default router;
