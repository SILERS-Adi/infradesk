import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { postPosition, getNearbytTickets } from './geolocation.controller';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'TECHNICIAN'));

router.post('/position', postPosition);
router.get('/nearby-tickets', getNearbytTickets);

export default router;
