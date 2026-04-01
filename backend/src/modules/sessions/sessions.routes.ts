import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { requireFeature } from '../../middleware/planLimits';
import { postStart, patchEnd, getByClient, postStartMobile, postPause, postResume, getActive, getAll, patchSession, removeSession } from './sessions.controller';

const router = Router();
router.use(requireFeature('sessions'));

router.get('/', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getAll);
router.post('/', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postStart);
router.patch('/:id', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), patchSession);
router.delete('/:id', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeSession);
router.post('/mobile', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postStartMobile);
router.get('/active', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getActive);
router.patch('/:id/end', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), patchEnd);
router.patch('/:id/pause', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postPause);
router.patch('/:id/resume', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postResume);
router.get('/client/:workspaceId', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getByClient);

export default router;
