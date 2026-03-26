import { Router } from 'express';
import { postVerifyPin, postRequestPin, getPinRequests } from './downloads.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

// Public endpoints
router.post('/verify-pin', postVerifyPin);
router.post('/request-pin', postRequestPin);

// Admin only
router.get('/pin-requests', authenticate, authorize('ADMIN'), getPinRequests);

export default router;
