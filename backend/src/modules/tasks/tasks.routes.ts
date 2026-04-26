import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import * as ctrl from './tasks.controller';

const router = Router();

router.use(authenticate, requireWorkspace, withWorkspaceMembership);

router.get('/', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), ctrl.listTasks);
router.post('/', authorizeWorkspace('OWNER', 'ADMIN'), ctrl.createTask);
router.get('/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), ctrl.getTask);
router.post('/:id/status', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), ctrl.changeStatus);
router.patch('/:id', authorizeWorkspace('OWNER', 'ADMIN'), ctrl.updateTask);

export default router;
