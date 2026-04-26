import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';

const router = Router();

const STUB_MSG = { error: 'Tenant module removed — use Workspace API instead' };

router.post('/register', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/download-agent', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/current', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/current/usage', authenticate, requireWorkspace, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) { res.status(400).json({ error: 'Workspace context required' }); return; }
    const { getWorkspaceUsage } = await import('../../middleware/planLimits');
    const usage = await getWorkspaceUsage(workspaceId);
    if (!usage) { res.status(404).json({ error: 'Workspace not found' }); return; }
    res.json(usage);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.patch('/current', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/current/regenerate-key', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/children', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/children', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.patch('/children/:childId/modules', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/', authenticate, (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });

export default router;
