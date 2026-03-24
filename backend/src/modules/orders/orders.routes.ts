import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './orders.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.listOrders);
router.get('/:id', ctrl.getOrder);
router.post('/', authorize('ADMIN', 'TECHNICIAN'), ctrl.createOrder);
router.post('/:id/status', authorize('ADMIN', 'TECHNICIAN'), ctrl.changeStatus);
router.delete('/:id', authorize('ADMIN'), ctrl.deleteOrder);
export default router;
