import { z } from 'zod';

export const putSettingSchema = z.object({
  value: z.string().min(1, 'value is required'),
});

export const putSmtpSchema = z.object({
  smtp_host: z.string().optional(),
  smtp_port: z.union([z.string(), z.number()]).optional(),
  smtp_user: z.string().optional(),
  smtp_pass: z.string().optional(),
  smtp_from: z.string().email().optional(),
});

export const smtpTestSchema = z.object({
  email: z.string().email('Podaj prawidłowy adres e-mail'),
});
