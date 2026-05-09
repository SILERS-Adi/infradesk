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

// Per-IP, publiczny endpoint rejestracji agenta — nie pozwala na masowe tworzenie rejestracji.
export const agentRegisterLimiter = make({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many agent registrations — spróbuj za minutę' },
});

// Ujawnianie hasła w vault — per user (z tokena), zapobiega eksfiltracji skryptem.
export const vaultRevealLimiter = make({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req as Request & { auth?: { sub: string } }).auth?.sub ?? req.ip ?? 'anon',
  message: { error: 'rate_limited', message: 'Too many credential reveals — spróbuj za minutę' },
});

// Iris (Anthropic) — każdy request to 508$, limitujemy per user.
export const irisLimiter = make({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req as Request & { auth?: { sub: string } }).auth?.sub ?? req.ip ?? 'anon',
  message: { error: 'rate_limited', message: 'Iris: zbyt wiele zapytań — spróbuj za minutę' },
});

// Download endpointy — per IP.
export const downloadLimiter = make({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many downloads' },
});

// Rejestracja konta + nowy workspace — anty-spam DB i mailbomb.
export const registerLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Zbyt wiele rejestracji — spróbuj za godzinę' },
});

// /auth/refresh — globalny limiter mówi 120/min, ale refresh przy każdym page reload
// może zalać DB updateMany na refresh-token jeśli ktoś atakuje. 30/min/IP wystarczy
// na normalny ruch (1 user × kilka kart) i odsiewa skrypty.
export const refreshLimiter = make({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many refresh attempts' },
});

// Confirm/verify token endpoints — token jest 24-byte random więc brute-force
// niemożliwy, ale spam DB write sensowny do limitowania.
export const tokenConsumeLimiter = make({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Zbyt wiele prób — spróbuj za godzinę' },
});
