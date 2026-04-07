/**
 * CSRF protection — Double Submit Cookie pattern.
 *
 * On login: backend sets a random CSRF token in a non-httpOnly cookie.
 * On state-changing requests: frontend sends the same token in X-CSRF-Token header.
 * Backend compares cookie value with header value.
 *
 * This works because:
 * - Attacker cannot read the cookie (SameSite + different origin)
 * - Attacker cannot set the header (CORS blocks cross-origin requests with custom headers)
 * - Token must match in both cookie AND header → proves request originates from our frontend
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

const CSRF_COOKIE = 'infradesk_csrf';
const CSRF_HEADER = 'x-csrf-token';

/** Generate and set CSRF token cookie. Call this on login/refresh. */
export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    domain: config.cookieDomain,
    path: '/',
    httpOnly: false,  // Frontend must read this to send in header
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches refresh token)
  });
  return token;
}

/** Clear CSRF cookie on logout. */
export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE, { domain: config.cookieDomain, path: '/' });
}

/**
 * CSRF validation middleware.
 * Skips: GET, HEAD, OPTIONS (safe methods).
 * Skips: requests using Authorization header (API clients, agents — not cookie-based).
 * Validates: POST, PUT, PATCH, DELETE when auth is cookie-based.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods — no CSRF risk
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Public endpoints that don't use cookies — skip CSRF
  // These are pre-login or agent endpoints, not vulnerable to CSRF
  const csrfExemptPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/public/',
    '/api/agent/register',
    '/api/agent/metrics',
    '/api/agent/ticket',
    '/api/agent/upload',
    '/api/agent/backup/',
    '/api/downloads/',
  ];
  if (csrfExemptPaths.some(p => req.path.startsWith(p))) {
    next();
    return;
  }

  // If request uses Authorization header (Bearer token), it's not cookie-based → skip CSRF
  // API clients and agents use this path — they're not vulnerable to CSRF
  if (req.headers.authorization) {
    next();
    return;
  }

  // Cookie-based auth → require CSRF token
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF token mismatch' });
    return;
  }

  next();
}
