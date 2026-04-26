import { Router } from 'express';
import { adminDashboard, clientDashboard } from './dashboard.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';

const router = Router();

router.use(authenticate, requireWorkspace);

router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), adminDashboard);
router.get('/stats', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), adminDashboard);
router.get('/client', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), clientDashboard);

export default router;
