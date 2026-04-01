import { Router } from 'express';
import { postVerifyPin, postRequestPin, getPinRequests } from './downloads.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';

const router = Router();

// Public endpoints
router.post('/verify-pin', postVerifyPin);
router.post('/request-pin', postRequestPin);

// Admin only
router.get('/pin-requests', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), getPinRequests);

export default router;
