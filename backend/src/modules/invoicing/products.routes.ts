import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createProductSchema, updateProductSchema } from './products.validation';
import * as ctrl from './products.controller';

const router = Router();
router.use(authenticate);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createProductSchema), ctrl.create);
router.put('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateProductSchema), ctrl.update);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), ctrl.remove);

export default router;
