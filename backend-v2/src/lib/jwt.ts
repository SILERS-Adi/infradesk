import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  workspaceId?: string;
  membershipId?: string;
  tokenVersion: number;
  isSuperAdmin?: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  tokenVersion: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: `${config.JWT_ACCESS_TTL_MIN}m`,
    issuer: 'infradesk-v2',
    audience: 'infradesk-v2-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'infradesk-v2',
    audience: 'infradesk-v2-api',
  }) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.JWT_REFRESH_TTL_DAYS}d`,
    issuer: 'infradesk-v2',
    audience: 'infradesk-v2-refresh',
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'infradesk-v2',
    audience: 'infradesk-v2-refresh',
  }) as RefreshTokenPayload;
}
