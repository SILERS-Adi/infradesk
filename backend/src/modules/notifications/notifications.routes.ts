import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './notifications.controller';

const router = Router();
router.use(authenticate);

router.post('/send',   authorize('ADMIN', 'TECHNICIAN'), ctrl.send);
router.get('/mine',    ctrl.getMine);
router.get('/unread',  ctrl.unreadCount);
router.post('/read',   ctrl.read);
router.post('/read-all', ctrl.readAll);

export default router;
