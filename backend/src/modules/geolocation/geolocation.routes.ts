import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { postPosition, getNearbytTickets } from './geolocation.controller';

const router = Router();

router.use(authenticate, requireWorkspace, withWorkspaceMembership);

router.post('/position', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postPosition);
router.get('/nearby-tickets', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getNearbytTickets);

export default router;
