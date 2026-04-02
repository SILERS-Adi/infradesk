import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createPaymentSchema } from './payments.validation';
import * as ctrl from './payments.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createPaymentSchema), ctrl.create);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), ctrl.remove);

export default router;
