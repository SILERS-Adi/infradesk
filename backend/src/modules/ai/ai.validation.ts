import { z } from 'zod';

export const voiceParseSchema = z.object({
  transcript: z.string().min(1, 'transcript is required'),
});

export const suggestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  deviceInfo: z.string().optional(),
});

export const commandSchema = z.object({
  transcript: z.string().min(1, 'transcript is required'),
});
