import { z } from 'zod';

export const createTaskSchema = z.object({
  title:            z.string().min(1, 'Tytuł jest wymagany'),
  description:      z.string().optional(),
  assignedToUserId: z.string().min(1, 'Przypisanie jest wymagane'),
  dueAt:            z.string().optional(),
  notes:            z.string().optional(),
});

export const changeTaskStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'DONE']),
  notes: z.string().optional(),
});

export const updateTaskSchema = z.object({
  notes: z.string().optional(),
  dueAt: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
