import { Router } from 'express';
import { postVerifyPin, postRequestPin, getPinRequests } from './downloads.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { downloadPinLimiter } from '../../middleware/rateLimit';

const router = Router();

// Public endpoints — rate limited to prevent PIN brute-force
router.post('/verify-pin', downloadPinLimiter, postVerifyPin);
router.post('/request-pin', downloadPinLimiter, postRequestPin);

// Admin only
router.get('/pin-requests', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), getPinRequests);

export default router;
