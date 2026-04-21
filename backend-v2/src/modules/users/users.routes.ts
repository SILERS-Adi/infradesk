import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../../lib/password';
import { HttpError } from '../../utils/httpError';

const router = Router();

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        avatarUrl: true, locale: true, timezone: true,
        emailVerified: true, twoFactorEnabled: true, isSuperAdmin: true,
        lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) throw HttpError.notFound();
    res.json({ user });
  } catch (err) { next(err); }
});

const updateMeSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  phone: z.string().max(40).optional().nullable(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
});

router.patch('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateMeSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: input,
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        avatarUrl: true, locale: true, timezone: true,
      },
    });
    res.json({ user });
  } catch (err) { next(err); }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

router.post('/me/change-password', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const pw = validatePasswordStrength(input.newPassword);
    if (!pw.ok) throw HttpError.badRequest(pw.reason!, 'weak_password');
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: { passwordHash: true },
    });
    if (!user) throw HttpError.notFound();
    const ok = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!ok) throw HttpError.unauthorized('Nieprawidłowe hasło', 'invalid_credentials');
    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.auth!.sub }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
      prisma.refreshToken.updateMany({ where: { userId: req.auth!.sub, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
