import { Router } from 'express';
import { adminDashboard, clientDashboard } from './dashboard.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'TECHNICIAN'), adminDashboard);
router.get('/stats', authorize('ADMIN', 'TECHNICIAN'), adminDashboard);
router.get('/client', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), clientDashboard);

export default router;
