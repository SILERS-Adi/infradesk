import { Router } from 'express';
import { getLocations, getLocation, postLocation, patchLocation, removeLocation } from './locations.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createLocationSchema, updateLocationSchema } from './locations.validation';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getLocations);
router.get('/:id', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getLocation);
router.post('/', authorize('ADMIN', 'TECHNICIAN'), validate(createLocationSchema), postLocation);
router.patch('/:id', authorize('ADMIN', 'TECHNICIAN'), validate(updateLocationSchema), patchLocation);
router.delete('/:id', authorize('ADMIN'), removeLocation);

export default router;
