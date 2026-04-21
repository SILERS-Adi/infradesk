import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const listSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  performedByUserId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/',
  requireAccess(MODULES.AUDIT_LOG, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = listSchema.parse(req.query);
      const workspaceId = (req as any).workspaceId as string;

      const where: any = { workspaceId };
      if (q.entityType) where.entityType = q.entityType;
      if (q.entityId) where.entityId = q.entityId;
      if (q.actionType) where.actionType = q.actionType;
      if (q.performedByUserId) where.performedByUserId = q.performedByUserId;
      if (q.from || q.to) {
        where.createdAt = {};
        if (q.from) where.createdAt.gte = q.from;
        if (q.to) where.createdAt.lte = q.to;
      }

      const items = await prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      const hasMore = items.length > q.limit;
      const page = hasMore ? items.slice(0, q.limit) : items;

      res.json({
        items: page,
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Aggregated counts per entityType / actionType (for filter UI).
router.get(
  '/facets',
  requireAccess(MODULES.AUDIT_LOG, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = (req as any).workspaceId as string;
      const [entityTypes, actionTypes, actors] = await Promise.all([
        prisma.activityLog.groupBy({
          by: ['entityType'],
          where: { workspaceId },
          _count: true,
          orderBy: { _count: { entityType: 'desc' } },
          take: 20,
        }),
        prisma.activityLog.groupBy({
          by: ['actionType'],
          where: { workspaceId },
          _count: true,
          orderBy: { _count: { actionType: 'desc' } },
          take: 30,
        }),
        prisma.activityLog.groupBy({
          by: ['performedByUserId'],
          where: { workspaceId, performedByUserId: { not: null } },
          _count: true,
          orderBy: { _count: { performedByUserId: 'desc' } },
          take: 20,
        }),
      ]);

      const userIds = actors.map((a) => a.performedByUserId).filter((v): v is string => !!v);
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      res.json({
        entityTypes: entityTypes.map((e) => ({ key: e.entityType, count: e._count })),
        actionTypes: actionTypes.map((a) => ({ key: a.actionType, count: a._count })),
        actors: actors.map((a) => ({
          id: a.performedByUserId!,
          user: userMap.get(a.performedByUserId!) ?? null,
          count: a._count,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
