import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import {
  getSettingHandler, putSettingHandler, getContactHandler, getFaqHandler,
  getSmtpHandler, putSmtpHandler, postSmtpTestHandler,
} from './settings.controller';

const router = Router();

// Public endpoints for agent
router.get('/agent/contact', getContactHandler);
router.get('/agent/faq',     getFaqHandler);

// SMTP settings (admin only)
router.get('/smtp',       authenticate, authorize('ADMIN'), getSmtpHandler);
router.put('/smtp',       authenticate, authorize('ADMIN'), putSmtpHandler);
router.post('/smtp/test', authenticate, authorize('ADMIN'), postSmtpTestHandler);

// Generic settings endpoints (must come after specific routes)
router.get('/:key', authenticate, getSettingHandler);
router.put('/:key', authenticate, authorize('ADMIN'), putSettingHandler);

export default router;
