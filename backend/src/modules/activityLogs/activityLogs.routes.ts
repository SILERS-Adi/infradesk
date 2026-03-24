import { Router } from 'express';
import { getActivityLogs } from './activityLogs.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'TECHNICIAN'));

router.get('/', getActivityLogs);

export default router;
