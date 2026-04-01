import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';

const router = Router();

const STUB_MSG = { error: 'Partners module removed — use WorkspaceManagement API instead' };

router.use(authenticate);

router.get('/', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/active', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/devices', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/invite', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/:id/respond', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.patch('/:id', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/:id/devices', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.delete('/:id/devices', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/guest-links', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.post('/guest-links', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });
router.get('/guest/:token', (_req: Request, res: Response) => { res.status(410).json(STUB_MSG); });

export default router;
