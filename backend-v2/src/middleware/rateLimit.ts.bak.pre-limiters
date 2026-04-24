import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';

const noop = (_req: Request, _res: Response, next: NextFunction) => next();

function make(opts: Parameters<typeof rateLimit>[0]): RateLimitRequestHandler | typeof noop {
  return config.isTest ? noop : rateLimit(opts);
}

export const globalLimiter = make({
  windowMs: 60 * 1000,
  max: config.RATE_LIMIT_GLOBAL_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests' },
});

export const loginLimiter = make({
  windowMs: 15 * 60 * 1000,
  max: config.RATE_LIMIT_LOGIN_PER_15MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'rate_limited', message: 'Too many login attempts — spróbuj za 15 minut' },
});

export const passwordResetLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many password reset requests' },
});
