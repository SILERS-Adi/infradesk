import { Router } from 'express';
import { login, refresh, me } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginSchema, refreshSchema } from './auth.validation';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);
router.get('/me', authenticate, me);

export default router;
