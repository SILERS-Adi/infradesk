import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import { requireFeature } from '../../middleware/planLimits';
import { postStart, patchEnd, getByClient, postStartMobile, postPause, postResume, getActive, getAll, patchSession, removeSession } from './sessions.controller';

const router = Router();
router.use(requireFeature('sessions'));

router.get('/', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getAll);
router.post('/', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postStart);
router.patch('/:id', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), patchSession);
router.delete('/:id', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeSession);
router.post('/mobile', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postStartMobile);
router.get('/active', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getActive);
router.patch('/:id/end', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), patchEnd);
router.patch('/:id/pause', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postPause);
router.patch('/:id/resume', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postResume);
router.get('/client', authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getByClient);

export default router;
