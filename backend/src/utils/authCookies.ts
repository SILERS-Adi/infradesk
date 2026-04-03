import { Response } from 'express';
import { config } from '../config';

const COOKIE_OPTIONS = {
  domain: config.cookieDomain,
  path: '/',
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax' as const,
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  // Access token: short-lived (15 min)
  res.cookie('infradesk_access', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000, // 15 min
  });

  // Refresh token: long-lived (7 days)
  res.cookie('infradesk_refresh', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // User info cookie (not httpOnly — frontend reads it for auto-detection)
  res.cookie('infradesk_logged_in', '1', {
    domain: config.cookieDomain,
    path: '/',
    httpOnly: false,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  const opts = { domain: config.cookieDomain, path: '/' };
  res.clearCookie('infradesk_access', opts);
  res.clearCookie('infradesk_refresh', opts);
  res.clearCookie('infradesk_logged_in', opts);
}
