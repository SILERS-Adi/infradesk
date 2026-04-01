import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SENSITIVE_PATHS = ['/api/credentials', '/api/auth'];
const IS_PROD = process.env.NODE_ENV === 'production';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = crypto.randomBytes(4).toString('hex');

  // Attach requestId for downstream use
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    const duration = Date.now() - start;
    const status = res.statusCode;

    // Skip health checks and static files in production
    if (IS_PROD && (req.path === '/health' || req.path.startsWith('/uploads'))) {
      return originalEnd.apply(res, args);
    }

    const isSensitive = SENSITIVE_PATHS.some(p => req.path.startsWith(p));
    const logLine = {
      rid: requestId,
      method: req.method,
      path: isSensitive ? req.path.replace(/\/[a-f0-9-]{36}/g, '/:id') : req.path,
      status,
      ms: duration,
      ws: req.workspaceId?.slice(0, 8) ?? null,
      uid: req.user?.userId?.slice(0, 8) ?? null,
    };

    // Log based on status
    if (status >= 500) {
      console.error('[REQ]', JSON.stringify(logLine));
    } else if (status >= 400 || duration > 2000) {
      console.warn('[REQ]', JSON.stringify(logLine));
    } else if (!IS_PROD) {
      console.log('[REQ]', JSON.stringify(logLine));
    }

    return originalEnd.apply(res, args);
  } as any;

  next();
}
