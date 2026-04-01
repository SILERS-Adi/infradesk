import { Router } from 'express';
import { getActivityLogs } from './activityLogs.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';

const router = Router();

router.use(authenticate, withWorkspaceMembership);

router.get('/', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getActivityLogs);

export default router;
