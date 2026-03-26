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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Insufficient permissions — your role: ${req.user.role}, required: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}

export function requireClientOwnership(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // ADMIN and TECHNICIAN can access any client data
  if (req.user.role === 'ADMIN' || req.user.role === 'TECHNICIAN') {
    next();
    return;
  }

  // CLIENT users can only access their own client data
  if (req.user.role === 'CLIENT') {
    const requestedClientId = req.params.clientId || req.query.clientId as string;
    if (requestedClientId && requestedClientId !== req.user.clientId) {
      res.status(403).json({ error: 'Access denied to this client data' });
      return;
    }
    next();
    return;
  }

  res.status(403).json({ error: 'Insufficient permissions' });
}
