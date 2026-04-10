import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createOrderSchema, changeOrderStatusSchema } from './orders.validation';
import * as ctrl from './orders.controller';

const router = Router();
router.use(authenticate, requireWorkspace);
router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), ctrl.listOrders);
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), ctrl.getOrder);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createOrderSchema), ctrl.createOrder);
router.post('/:id/status', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(changeOrderStatusSchema), ctrl.changeStatus);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), ctrl.deleteOrder);
export default router;
