import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(10).max(128),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z.string().trim().max(40).optional(),
  workspaceName: z.string().min(2).max(120).trim().optional(),
  workspaceSlug: z.string().regex(/^[a-z0-9-]{3,40}$/).optional(),
  // Opcjonalne dane firmy (z MF białej listy / CEIDG przy rejestracji)
  taxId: z.string().regex(/^[0-9]{10}$/).optional(),
  regon: z.string().max(20).optional(),
  addressLine1: z.string().max(200).optional(),
  postalCode: z.string().max(10).optional(),
  city: z.string().max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  password: z.string().min(1).max(256),
  twoFactorCode: z.string().regex(/^\d{6}$|^[A-Z0-9]{10}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestResetSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
});

export const confirmResetSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(10).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});

export const twoFactorSetupSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});
