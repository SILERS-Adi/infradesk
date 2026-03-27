import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { postStart, patchEnd, getByClient, postStartMobile, postPause, postResume, getActive, getAll, patchSession, removeSession } from './sessions.controller';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'TECHNICIAN'), getAll);
router.post('/', authenticate, authorize('ADMIN', 'TECHNICIAN'), postStart);
router.patch('/:id', authenticate, authorize('ADMIN'), patchSession);
router.delete('/:id', authenticate, authorize('ADMIN'), removeSession);
router.post('/mobile', authenticate, authorize('ADMIN', 'TECHNICIAN'), postStartMobile);
router.get('/active', authenticate, authorize('ADMIN', 'TECHNICIAN'), getActive);
router.patch('/:id/end', authenticate, authorize('ADMIN', 'TECHNICIAN'), patchEnd);
router.patch('/:id/pause', authenticate, authorize('ADMIN', 'TECHNICIAN'), postPause);
router.patch('/:id/resume', authenticate, authorize('ADMIN', 'TECHNICIAN'), postResume);
router.get('/client/:clientId', authenticate, authorize('ADMIN', 'TECHNICIAN'), getByClient);

export default router;
