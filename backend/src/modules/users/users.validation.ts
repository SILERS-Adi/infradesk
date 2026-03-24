import { z } from 'zod';

const roleEnum = z.enum(['ADMIN', 'TECHNICIAN', 'CLIENT']);

const permissionsSchema = z.object({
  viewAll:  z.boolean().optional(),
  orders:   z.boolean().optional(),
  billing:  z.boolean().optional(),
}).optional().nullable();

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: roleEnum,
  roles: z.array(roleEnum).optional(),
  clientId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  permissions: permissionsSchema,
  notificationSettings: z.object({
    emailOnNewTicket:    z.boolean().default(true),
    emailOnTicketUpdate: z.boolean().default(true),
    emailOnAssignment:   z.boolean().default(true),
  }).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
  role: roleEnum.optional(),
  roles: z.array(roleEnum).optional(),
  clientId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  permissions: permissionsSchema,
  notificationSettings: z.object({
    emailOnNewTicket:    z.boolean().optional(),
    emailOnTicketUpdate: z.boolean().optional(),
    emailOnAssignment:   z.boolean().optional(),
  }).optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.enum(['ADMIN', 'TECHNICIAN', 'CLIENT']).optional(),
  clientId: z.string().uuid().optional(),
  isActive: z.string().optional().transform((v) => v === 'true' ? true : v === 'false' ? false : undefined),
  page: z.string().optional().transform((v) => v ? parseInt(v, 10) : 1),
  limit: z.string().optional().transform((v) => v ? parseInt(v, 10) : 20),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
