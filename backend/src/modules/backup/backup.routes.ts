import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createBackupConfigSchema, updateBackupConfigSchema } from './backup.validation';
import {
  getConfigs, getConfig, postConfig, patchConfig, removeConfig,
  getHistory, runNow,
} from './backup.controller';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'TECHNICIAN'));

router.get('/configs', getConfigs);
router.get('/configs/:id', getConfig);
router.post('/configs', validate(createBackupConfigSchema), postConfig);
router.patch('/configs/:id', validate(updateBackupConfigSchema), patchConfig);
router.delete('/configs/:id', removeConfig);
router.get('/configs/:id/history', getHistory);
router.post('/configs/:id/run-now', runNow);

export default router;
