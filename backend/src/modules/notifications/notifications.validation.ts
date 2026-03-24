import { z } from 'zod';

export const sendNotificationSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  title:   z.string().min(1).max(200),
  message: z.string().min(1),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
