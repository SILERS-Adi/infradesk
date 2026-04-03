import { Request, Response, NextFunction } from 'express';
import { loginService, refreshTokenService, getMeService, forgotPasswordService, resetPasswordService, registerService, checkSlugAvailability } from './auth.service';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, JwtPayload } from '../../utils/jwt';
import { verifyRefreshToken } from '../../utils/jwt';
import { setAuthCookies, clearAuthCookies } from '../../utils/authCookies';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginService(req.body);
    setAuthCookies(res, result.accessToken, result.refreshToken);

    // Include workspace info for subdomain redirect
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: result.user.id, status: 'ACTIVE' },
      select: { workspace: { select: { id: true, slug: true, type: true } }, isDefault: true },
      orderBy: [{ isDefault: 'desc' }],
    });

    res.status(200).json({
      ...result,
      workspaces: memberships.map(m => ({
        id: m.workspace.id,
        slug: m.workspace.slug,
        type: m.workspace.type,
        isDefault: m.isDefault,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Read refresh token from body OR cookie
    const refreshToken = req.body.refreshToken || req.cookies?.infradesk_refresh;
    if (!refreshToken) { res.status(401).json({ error: 'Refresh token required' }); return; }

    const result = await refreshTokenService(refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function autoLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const agentToken = req.query.token as string;
    if (!agentToken) { res.status(400).json({ error: 'token required' }); return; }

    const reg = await prisma.agentRegistration.findUnique({
      where: { agentToken },
      select: { workspaceId: true, status: true, contactEmail: true },
    });
    if (!reg || reg.status !== 'ACTIVE' || !reg.workspaceId) {
      res.status(401).json({ error: 'Invalid agent token' }); return;
    }

    let user = reg.contactEmail
      ? await prisma.user.findUnique({ where: { email: reg.contactEmail } })
      : null;

    if (!user) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId: reg.workspaceId },
        include: { user: true },
      });
      user = membership?.user ?? null;
    }

    if (!user) { res.status(401).json({ error: 'No user found for this workspace' }); return; }

    const payload: JwtPayload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);

    res.redirect(`/portal#autologin=${encodeURIComponent(JSON.stringify({
      accessToken, refreshToken,
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    }))}`);
  } catch (err) { next(err); }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await getMeService(userId);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email jest wymagany' }); return; }
    const result = await forgotPasswordService(email);
    res.json(result);
  } catch (err) { next(err); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    if (!token || !password) { res.status(400).json({ error: 'Token i hasło są wymagane' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Hasło musi mieć min. 6 znaków' }); return; }
    const result = await resetPasswordService(token, password);
    res.json(result);
  } catch (err) { next(err); }
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await registerService(req.body);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function checkSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = req.query.slug as string;
    if (!slug) { res.status(400).json({ error: 'slug is required' }); return; }
    const available = await checkSlugAvailability(slug);
    res.json({ slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), available });
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response): Promise<void> {
  clearAuthCookies(res);
  res.json({ success: true });
}
