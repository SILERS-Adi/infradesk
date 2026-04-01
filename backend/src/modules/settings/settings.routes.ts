import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { putSettingSchema, putSmtpSchema, smtpTestSchema } from './settings.validation';
import {
  getSettingHandler, putSettingHandler, getContactHandler, getFaqHandler,
  getSmtpHandler, putSmtpHandler, postSmtpTestHandler,
} from './settings.controller';

const router = Router();

// Public endpoints for agent
router.get('/agent/contact', getContactHandler);
router.get('/agent/faq',     getFaqHandler);

// SMTP settings (admin only)
router.get('/smtp',       authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), getSmtpHandler);
router.put('/smtp',       authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(putSmtpSchema), putSmtpHandler);
router.post('/smtp/test', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(smtpTestSchema), postSmtpTestHandler);

// Generic settings endpoints (must come after specific routes)
router.get('/:key', authenticate, getSettingHandler);
router.put('/:key', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(putSettingSchema), putSettingHandler);

export default router;
