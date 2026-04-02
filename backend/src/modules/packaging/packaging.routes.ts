import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createShipmentSchema, updateShipmentSchema } from './packaging.validation';
import * as ctrl from './packaging.controller';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listShipments);
router.get('/:id', ctrl.getShipment);

router.post('/',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(createShipmentSchema),
  ctrl.createShipment,
);

router.put('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(updateShipmentSchema),
  ctrl.updateShipment,
);

router.delete('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN'),
  ctrl.deleteShipment,
);

export default router;
