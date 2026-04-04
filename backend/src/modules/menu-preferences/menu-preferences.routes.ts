import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { getMenuPreference, saveMenuPreference, deleteMenuPreference } from './menu-preferences.service';
import { menuLayoutSchema } from './menu-preferences.validation';

const router = Router();
router.use(authenticate);

// GET — fetch user's menu layout for active workspace
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const layout = await getMenuPreference(userId, wsId);
    res.json({ layout });
  } catch (err) { next(err); }
});

// PUT — save user's menu layout
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const parsed = menuLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid layout', details: parsed.error.flatten() });
      return;
    }

    await saveMenuPreference(userId, wsId, parsed.data);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE — reset to defaults
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    await deleteMenuPreference(userId, wsId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
