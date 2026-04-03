import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Source 1: Authorization header (existing flow)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      req.user = verifyAccessToken(token);
      next();
      return;
    } catch {
      // Fall through to cookie check
    }
  }

  // Source 2: Cookie (cross-subdomain flow)
  const cookieToken = req.cookies?.infradesk_access;
  if (cookieToken) {
    try {
      req.user = verifyAccessToken(cookieToken);
      next();
      return;
    } catch {
      // Token expired — client should use refresh
    }
  }

  res.status(401).json({ error: 'Authentication required' });
}
