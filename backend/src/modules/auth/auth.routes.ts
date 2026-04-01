import { Router } from 'express';
import { login, refresh, me, autoLogin, forgotPassword, resetPassword } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginSchema, refreshSchema } from './auth.validation';
import { authLimiter } from '../../middleware/rateLimit';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), login);
router.get('/auto-login', autoLogin);
router.post('/refresh', validate(refreshSchema), refresh);
router.get('/me', authenticate, me);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

export default router;
