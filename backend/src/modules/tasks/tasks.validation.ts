import { z } from 'zod';

export const changeTaskStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'DONE']),
  notes: z.string().optional(),
});

export const updateTaskSchema = z.object({
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
