import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createAccessTypeSchema, updateAccessTypeSchema } from './accessTypes.validation';
import { getAccessTypes, postAccessType, patchAccessType, removeAccessType } from './accessTypes.controller';

const router = Router();
router.use(authenticate);
router.get('/', getAccessTypes);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createAccessTypeSchema), postAccessType);
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(updateAccessTypeSchema), patchAccessType);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeAccessType);
export default router;
