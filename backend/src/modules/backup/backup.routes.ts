import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createBackupConfigSchema, updateBackupConfigSchema } from './backup.validation';
import {
  getConfigs, getConfig, postConfig, patchConfig, removeConfig,
  getHistory, runNow,
} from './backup.controller';
import { requireFeature } from '../../middleware/planLimits';

const router = Router();

router.use(authenticate, withWorkspaceMembership, requireFeature('backup'));

router.get('/configs', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getConfigs);
router.get('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getConfig);
router.post('/configs', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createBackupConfigSchema), postConfig);
router.patch('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateBackupConfigSchema), patchConfig);
router.delete('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN'), removeConfig);
router.get('/configs/:id/history', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getHistory);
router.post('/configs/:id/run-now', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), runNow);

export default router;
