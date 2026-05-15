import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { updateWorkspaceInContext } from '../lib/requestContext';
import { HttpError } from '../utils/httpError';
import { isAccountGateExempt } from './auth';

/**
 * Resolves the active workspace for the request.
 * Priority:
 *  1. X-Workspace-Id header (must match an active Membership for req.auth.sub)
 *  2. req.auth.workspaceId (stamped inside the access token at login/switch)
 *  3. Default Membership (isDefault=true) for user
 *
 * Rejects if user has no active membership to the chosen workspace.
 */
export async function requireWorkspace(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw HttpError.unauthorized();
    const userId = req.auth.sub;

    const headerId = req.header('x-workspace-id')?.trim();
    const claimed = headerId || req.auth.workspaceId;

    let membership = null;
    if (claimed) {
      membership = await prisma.membership.findFirst({
        where: { userId, workspaceId: claimed, status: 'ACTIVE' },
        select: { id: true, workspaceId: true, role: true, scope: true },
      });
    }
    // Fallback: if claimed workspace is invalid OR not claimed, use default membership.
    // This prevents user getting stuck with a stale X-Workspace-Id in localStorage.
    if (!membership) {
      membership = await prisma.membership.findFirst({
        where: { userId, status: 'ACTIVE', isDefault: true },
        select: { id: true, workspaceId: true, role: true, scope: true },
      });
    }
    if (!membership) {
      membership = await prisma.membership.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, workspaceId: true, role: true, scope: true },
      });
    }

    if (!membership) throw HttpError.forbidden('No active workspace membership');

    // P1.2 — backend 2FA enforcement dla OWNER. Frontend modal można obejść
    // przez DevTools / bezpośrednie API. Egzekwujemy też tutaj: OWNER bez 2FA
    // dostaje 403 na każdym endpoint poza /auth/* i /public/*.
    const twoFactorEnabled = (req as Request & { _userTwoFactorEnabled?: boolean })._userTwoFactorEnabled;
    if (membership.role === 'OWNER' && !twoFactorEnabled && !isAccountGateExempt(req.originalUrl)) {
      throw HttpError.forbidden(
        'Konto OWNER wymaga włączenia 2FA — przejdź do ustawień bezpieczeństwa.',
        '2fa_setup_required',
      );
    }

    req.workspaceId = membership.workspaceId;
    req.membershipId = membership.id;
    updateWorkspaceInContext(membership.workspaceId);
    next();
  } catch (err) {
    next(err);
  }
}
