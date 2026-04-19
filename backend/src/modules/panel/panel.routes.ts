import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { pulse, tiles, activity } from './panel.controller';

const router = Router();

router.use(authenticate);
router.use(withWorkspaceMembership);

// Każdy zalogowany członek workspace'u widzi swój Panel Dziś.
const anyRole = authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER', 'VIEWER');

router.get('/pulse', anyRole, pulse);
router.get('/tiles', anyRole, tiles);
router.get('/activity', anyRole, activity);

export default router;
