import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createProductSchema, updateProductSchema } from './products.validation';
import * as ctrl from './products.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createProductSchema), ctrl.create);
router.put('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateProductSchema), ctrl.update);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('invoicing.products', 'DELETE'), ctrl.remove);

export default router;
