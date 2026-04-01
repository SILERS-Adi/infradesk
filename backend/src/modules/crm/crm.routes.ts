import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createCrmActivitySchema, updateCrmActivitySchema } from './crm.validation';
import { getActivities, getActivity, postActivity, patchActivity, removeActivity, getTimeline } from './crm.controller';
import { requireFeature } from '../../middleware/planLimits';

const router = Router();
router.use(authenticate, requireFeature('crm'));

router.get('/',                    withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getActivities);
router.get('/timeline/:workspaceId',  withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getTimeline);
router.get('/:id',                 withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getActivity);
router.post('/',                   withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createCrmActivitySchema), postActivity);
router.patch('/:id',               withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateCrmActivitySchema), patchActivity);
router.delete('/:id',              withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'),               removeActivity);

export default router;
