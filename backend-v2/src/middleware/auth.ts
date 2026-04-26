import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { HttpError } from '../utils/httpError';
import { prisma } from '../lib/prisma';
import { requestContextStore } from '../lib/requestContext';

function extractToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.access_token;
  if (cookie && typeof cookie === 'string') return cookie;
  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw HttpError.unauthorized('Missing access token');

    const payload = verifyAccessToken(token);

    // Token revocation check — tokenVersion must match the current User.tokenVersion.
    // This lets logout-everywhere / password-change invalidate all access tokens.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tokenVersion: true, isActive: true, deletedAt: true, isSuperAdmin: true },
    });
    if (!user || !user.isActive || user.deletedAt) throw HttpError.unauthorized('Account not active');
    if (user.tokenVersion !== payload.tokenVersion) throw HttpError.unauthorized('Token revoked');

    req.auth = { ...payload, isSuperAdmin: user.isSuperAdmin };

    // RLS context: seed a mutable box for this request; requireWorkspace fills workspaceId later.
    // Prisma extension reads ctx on every query — see src/lib/prisma.ts (Strategy D).
    const box = {
      current: {
        userId: payload.sub,
        workspaceId: null as string | null,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
    requestContextStore.run(box, () => next());
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    return next(HttpError.unauthorized('Invalid access token'));
  }
}

// Optional auth — if token present and valid, attach req.auth, else continue.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;

    // Seed RLS context too — we can't know isSuperAdmin without a DB lookup here,
    // so conservative default is false. Downstream requireAuth handlers (if used)
    // would overwrite. optionalAuth is used for routes that accept but don't require auth.
    const box = {
      current: {
        userId: payload.sub,
        workspaceId: null as string | null,
        isSuperAdmin: false,
      },
    };
    requestContextStore.run(box, () => next());
    return;
  } catch {
    // invalid token — proceed without auth
  }
  next();
}
