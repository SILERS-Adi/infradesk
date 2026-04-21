import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { loginLimiter, passwordResetLimiter } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/auth';
import {
  registerSchema, loginSchema, requestResetSchema, confirmResetSchema,
  verifyEmailSchema, twoFactorSetupSchema, twoFactorDisableSchema,
} from './auth.schemas';
import * as service from './auth.service';
import { HttpError } from '../../utils/httpError';

const router = Router();

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v2/auth',
    maxAge: config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    domain: config.isProduction ? config.COOKIE_DOMAIN : undefined,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('refresh_token', { path: '/api/v2/auth' });
}

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await service.register(input);
    setRefreshCookie(res, result.tokens.refreshToken);
    res.status(201).json({
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresInSeconds: result.tokens.expiresInSeconds,
      defaultWorkspaceId: result.defaultWorkspaceId,
    });
  } catch (err) { next(err); }
});

router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await service.login(input, req.ip, req.get('user-agent') ?? undefined);
    setRefreshCookie(res, result.tokens.refreshToken);
    res.json({
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresInSeconds: result.tokens.expiresInSeconds,
      defaultWorkspaceId: result.defaultWorkspaceId,
    });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (!raw) throw HttpError.unauthorized('Missing refresh token');
    const tokens = await service.refresh(raw);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds });
  } catch (err) { next(err); }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.logout(req.cookies?.refresh_token);
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/logout-everywhere', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.logoutEverywhere(req.auth!.sub);
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/change-password', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(10).max(200),
    });
    const input = schema.parse(req.body);
    await service.changePassword(req.auth!.sub, input.currentPassword, input.newPassword);
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/password-reset/request', passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = requestResetSchema.parse(req.body);
    const result = await service.requestPasswordReset(input.email);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/password-reset/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = confirmResetSchema.parse(req.body);
    await service.confirmPasswordReset(input.token, input.password);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = verifyEmailSchema.parse(req.body);
    await service.verifyEmail(input.token);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/2fa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.setupTwoFactor(req.auth!.sub, req.auth!.email);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/2fa/confirm', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = twoFactorSetupSchema.parse(req.body);
    const result = await service.confirmTwoFactor(req.auth!.sub, input.code);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/2fa/disable', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = twoFactorDisableSchema.parse(req.body);
    await service.disableTwoFactor(req.auth!.sub, input.password, input.code);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ auth: req.auth });
  } catch (err) { next(err); }
});

export default router;
