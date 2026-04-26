import rateLimit from 'express-rate-limit';

const rateLimitResponse = (message: string) => ({
  handler: (_req: any, res: any) => {
    res.status(429).json({
      error: 'Too many requests',
      message,
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/** Auth endpoints: login, forgot-password, reset-password */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele prób logowania. Spróbuj ponownie za minutę.'),
});

/** User registration: stricter limit */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele prób rejestracji. Spróbuj ponownie za 15 minut.'),
});

/** Agent registration: public endpoint — tight limit to prevent mass enrollment */
export const agentRegisterLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele rejestracji agenta. Spróbuj ponownie za 5 minut.'),
});

/** Download PIN verification: prevent brute-force (6-digit PIN = 1M combinations) */
export const downloadPinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele prób weryfikacji PIN. Spróbuj ponownie za minutę.'),
});

/** Credential reveal: sensitive data access */
export const credentialRevealLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele odsłonięć haseł. Spróbuj ponownie za minutę.'),
});

/** Public ticket submission: prevent spam/DoS */
export const publicTicketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele zgłoszeń. Spróbuj ponownie za minutę.'),
});

/** Public QR lookup: prevent enumeration */
export const qrLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele zapytań QR. Spróbuj ponownie za minutę.'),
});
