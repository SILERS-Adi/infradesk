import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAccessTypeSchema, updateAccessTypeSchema } from './accessTypes.validation';
import { getAccessTypes, postAccessType, patchAccessType, removeAccessType } from './accessTypes.controller';

const router = Router();
router.use(authenticate);
router.get('/', getAccessTypes);
router.post('/', authorize('ADMIN', 'TECHNICIAN'), validate(createAccessTypeSchema), postAccessType);
router.patch('/:id', authorize('ADMIN'), validate(updateAccessTypeSchema), patchAccessType);
router.delete('/:id', authorize('ADMIN'), removeAccessType);
export default router;
