import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createPaymentSchema } from './payments.validation';
import * as ctrl from './payments.controller';

const router = Router();
router.use(authenticate, requireWorkspace);
router.get('/', ctrl.list);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createPaymentSchema), ctrl.create);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('invoicing.payments', 'DELETE'), ctrl.remove);

export default router;
