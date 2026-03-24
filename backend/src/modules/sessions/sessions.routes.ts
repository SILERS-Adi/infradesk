import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { postStart, patchEnd, getByClient } from './sessions.controller';

const router = Router();

router.post('/', authenticate, authorize('ADMIN', 'TECHNICIAN'), postStart);
router.patch('/:id/end', authenticate, authorize('ADMIN', 'TECHNICIAN'), patchEnd);
router.get('/client/:clientId', authenticate, authorize('ADMIN', 'TECHNICIAN'), getByClient);

export default router;
