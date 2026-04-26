import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './push.controller';

const router = Router();
// Security: user-scoped, no workspace isolation needed
router.use(authenticate);

router.get('/vapid-public-key', ctrl.getPublicKey);
router.post('/subscribe', ctrl.subscribe);
router.delete('/unsubscribe', ctrl.unsubscribe);

export default router;
