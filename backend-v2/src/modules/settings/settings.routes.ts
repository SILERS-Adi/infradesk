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

const KEY_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

// GET /settings/:key — read single setting value (returns { value: any | null })
router.get(
  '/:key',
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = String(req.params.key);
      if (!KEY_REGEX.test(key)) throw HttpError.badRequest('Nieprawidłowy klucz ustawienia');
      const setting = await prisma.workspaceSetting.findUnique({
        where: { workspaceId_key: { workspaceId: req.workspaceId!, key } },
        select: { value: true, updatedAt: true },
      });
      res.json({ key, value: setting?.value ?? null, updatedAt: setting?.updatedAt ?? null });
    } catch (err) { next(err); }
  },
);

// PUT /settings/:key — upsert setting (body: { value: any })
router.put(
  '/:key',
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = String(req.params.key);
      if (!KEY_REGEX.test(key)) throw HttpError.badRequest('Nieprawidłowy klucz ustawienia');
      const body = z.object({ value: z.unknown() }).parse(req.body);
      const setting = await prisma.workspaceSetting.upsert({
        where: { workspaceId_key: { workspaceId: req.workspaceId!, key } },
        update: { value: body.value as object },
        create: { workspaceId: req.workspaceId!, key, value: body.value as object },
      });
      res.json({ key, value: setting.value, updatedAt: setting.updatedAt });
    } catch (err) { next(err); }
  },
);

// GET /settings — list all settings for workspace (useful for bulk fetch in UI)
router.get(
  '/',
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await prisma.workspaceSetting.findMany({
        where: { workspaceId: req.workspaceId! },
        select: { key: true, value: true, updatedAt: true },
        orderBy: { key: 'asc' },
      });
      res.json({ settings: list });
    } catch (err) { next(err); }
  },
);

export default router;
