import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { HttpError } from '../utils/httpError';
import { prisma } from '../lib/prisma';
import { requestContextStore } from '../lib/requestContext';
import { logger } from '../lib/logger';

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
    if (!token) {
      logger.warn({ path: req.path }, '[auth-debug] no token');
      throw HttpError.unauthorized('Missing access token');
    }

    let payload;
    try { payload = verifyAccessToken(token); } catch (e) {
      logger.warn({ path: req.path, err: (e as Error).message }, '[auth-debug] jwt verify failed');
      throw HttpError.unauthorized('Invalid access token');
    }

    // Token revocation check — tokenVersion must match the current User.tokenVersion.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tokenVersion: true, isActive: true, deletedAt: true, isSuperAdmin: true },
    });
    if (!user) {
      logger.warn({ path: req.path, sub: payload.sub }, '[auth-debug] user not found by id from token');
      throw HttpError.unauthorized('Account not active');
    }
    if (!user.isActive || user.deletedAt) {
      logger.warn({ path: req.path, sub: payload.sub, isActive: user.isActive, deletedAt: user.deletedAt }, '[auth-debug] user inactive/deleted');
      throw HttpError.unauthorized('Account not active');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      logger.warn({ path: req.path, sub: payload.sub, dbV: user.tokenVersion, tokV: payload.tokenVersion }, '[auth-debug] tokenVersion mismatch');
      throw HttpError.unauthorized('Token revoked');
    }

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
