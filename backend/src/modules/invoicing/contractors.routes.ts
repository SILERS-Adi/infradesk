import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createContractorSchema, updateContractorSchema } from './contractors.validation';
import * as ctrl from './contractors.controller';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createContractorSchema), ctrl.create);
router.put('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateContractorSchema), ctrl.update);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('invoicing.contractors', 'DELETE'), ctrl.remove);

export default router;
