import { Router } from 'express';
import {
  getDevices,
  getDevice,
  getDeviceQrCode,
  postDevice,
  patchDevice,
  removeDevice,
} from './devices.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createDeviceSchema, updateDeviceSchema } from './devices.validation';

const router = Router();

router.use(authenticate, requireWorkspace);

router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getDevices);
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getDevice);
router.get('/:id/qr', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getDeviceQrCode);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createDeviceSchema), postDevice);
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateDeviceSchema), patchDevice);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeDevice);

export default router;
