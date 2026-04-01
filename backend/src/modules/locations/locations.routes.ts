import { Router } from 'express';
import { getLocations, getLocation, postLocation, patchLocation, removeLocation } from './locations.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createLocationSchema, updateLocationSchema } from './locations.validation';

const router = Router();

router.use(authenticate);

router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getLocations);
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getLocation);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createLocationSchema), postLocation);
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateLocationSchema), patchLocation);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeLocation);

export default router;
