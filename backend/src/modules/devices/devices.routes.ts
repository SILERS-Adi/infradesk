import { Router } from 'express';
import {
  getDevices,
  getDevice,
  getDeviceQrCode,
  postDevice,
  patchDevice,
  removeDevice,
} from './devices.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createDeviceSchema, updateDeviceSchema } from './devices.validation';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getDevices);
router.get('/:id', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getDevice);
router.get('/:id/qr', authorize('ADMIN', 'TECHNICIAN'), getDeviceQrCode);
router.post('/', authorize('ADMIN', 'TECHNICIAN'), validate(createDeviceSchema), postDevice);
router.patch('/:id', authorize('ADMIN', 'TECHNICIAN'), validate(updateDeviceSchema), patchDevice);
router.delete('/:id', authorize('ADMIN'), removeDevice);

export default router;
