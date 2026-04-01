import { Request, Response, NextFunction } from 'express';
import { loginService, refreshTokenService, getMeService, forgotPasswordService, resetPasswordService } from './auth.service';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, JwtPayload } from '../../utils/jwt';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const result = await refreshTokenService(refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function autoLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const agentToken = req.query.token as string;
    if (!agentToken) { res.status(400).json({ error: 'token required' }); return; }

    // Find agent registration by token
    const reg = await prisma.agentRegistration.findUnique({
      where: { agentToken },
      select: { workspaceId: true, status: true, contactEmail: true },
    });
    if (!reg || reg.status !== 'ACTIVE' || !reg.workspaceId) {
      res.status(401).json({ error: 'Invalid agent token' }); return;
    }

    // Find a user linked to this workspace
    let user = reg.contactEmail
      ? await prisma.user.findUnique({ where: { email: reg.contactEmail } })
      : null;

    if (!user) {
      // Find any active user for this workspace
      const membership = await prisma.workspaceMembership.findFirst({
        where: { workspaceId: reg.workspaceId },
        include: { user: true },
      });
      user = membership?.user ?? null;
    }

    if (!user) { res.status(401).json({ error: 'No user found for this workspace' }); return; }

    const payload: JwtPayload = {
      userId: user.id, email: user.email,
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Redirect to portal with tokens in URL hash (not query — safer)
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
