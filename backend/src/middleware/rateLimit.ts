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

/** Agent registration: public endpoint */
export const agentRegisterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele rejestracji agenta. Spróbuj ponownie za minutę.'),
});

/** Credential reveal: sensitive data access */
export const credentialRevealLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitResponse('Zbyt wiele odsłonięć haseł. Spróbuj ponownie za minutę.'),
});
