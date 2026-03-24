import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { getSettingHandler, putSettingHandler, getContactHandler, getFaqHandler } from './settings.controller';

const router = Router();

// Public endpoints for agent
router.get('/agent/contact', getContactHandler);
router.get('/agent/faq',     getFaqHandler);

// Protected settings endpoints
router.get('/:key', authenticate, getSettingHandler);
router.put('/:key', authenticate, authorize('ADMIN'), putSettingHandler);

export default router;
