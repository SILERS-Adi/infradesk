import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCrmActivitySchema, updateCrmActivitySchema } from './crm.validation';
import { getActivities, getActivity, postActivity, patchActivity, removeActivity, getTimeline } from './crm.controller';

const router = Router();
router.use(authenticate);

router.get('/',                    authorize('ADMIN', 'TECHNICIAN'), getActivities);
router.get('/timeline/:clientId',  authorize('ADMIN', 'TECHNICIAN'), getTimeline);
router.get('/:id',                 authorize('ADMIN', 'TECHNICIAN'), getActivity);
router.post('/',                   authorize('ADMIN', 'TECHNICIAN'), validate(createCrmActivitySchema), postActivity);
router.patch('/:id',               authorize('ADMIN', 'TECHNICIAN'), validate(updateCrmActivitySchema), patchActivity);
router.delete('/:id',              authorize('ADMIN'),               removeActivity);

export default router;
