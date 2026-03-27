import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateTaskInput, ChangeTaskStatusInput, UpdateTaskInput } from './tasks.validation';
import { TaskStatus } from '@prisma/client';
import { completeTicket } from '../tickets/tickets.service';

const taskSelect = {
  id: true,
  taskNumber: true,
  ticketId: true,
  title: true,
  description: true,
  status: true,
  dueAt: true,
  completedAt: true,
  notes: true,
  travelKm: true,
  createdAt: true,
  updatedAt: true,
  ticket: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      priority: true,
      serviceMode: true,
      client: { select: { id: true, name: true, hasContract: true, contractHours: true, contractMonthlyValue: true, hourlyRate: true, contractHourlyRateOverLimit: true, billingIntervalMinutes: true } },
      location: { select: { id: true, name: true, contactPersonName: true, contactPersonPhone: true } },
      device: { select: { id: true, name: true, rustdeskId: true, assignedUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } } } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } },
      reporterName: true,
      reporterPhone: true,
      source: true,
    },
  },
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export async function generateTaskNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.task.count({
    where: { taskNumber: { startsWith: `TSK-${year}-` } },
  });
  return `TSK-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function createTask(
  data: CreateTaskInput,
  requestingUser: { id: string; role: string }
) {
  const taskNumber = await generateTaskNumber();
  const task = await prisma.task.create({
    data: {
      taskNumber,
      title:            data.title,
      description:      data.description,
      assignedToUserId: data.assignedToUserId,
      createdByUserId:  requestingUser.id,
      dueAt:            data.dueAt ? new Date(data.dueAt) : undefined,
      notes:            data.notes,
      status:           TaskStatus.NEW,
    } as any,
    select: taskSelect,
  });

  await logActivity(prisma, {
    entityType: 'Task',
    entityId:   task.id,
    actionType: 'CREATE',
    description: `Task ${taskNumber} created`,
    performedByUserId: requestingUser.id,
    metadata: { title: data.title },
  });

  return task;
}

export async function listTasks(params: {
  requestingUser: { id: string; role: string };
  status?: TaskStatus;
  assignedToUserId?: string;
  all?: boolean;
}) {
  const { requestingUser, status, assignedToUserId, all } = params;

  const where: Record<string, unknown> = {};

  // Technician sees only their tasks unless admin
  if (requestingUser.role !== 'ADMIN' && !all) {
    where.assignedToUserId = requestingUser.id;
  } else if (assignedToUserId) {
    where.assignedToUserId = assignedToUserId;
  }

  if (status) where.status = status;

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: taskSelect,
  });

  return tasks;
}

export async function getTaskById(id: string, requestingUser: { id: string; role: string }) {
  const task = await prisma.task.findUnique({ where: { id }, select: taskSelect });
  if (!task) throw new AppError('Task not found', 404);

  if (requestingUser.role === 'TECHNICIAN' && task.assignedTo.id !== requestingUser.id) {
    throw new AppError('Access denied', 403);
  }

  return task;
}

export async function changeTaskStatus(
  id: string,
  data: ChangeTaskStatusInput,
  requestingUser: { id: string; role: string }
) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError('Task not found', 404);

  if (requestingUser.role === 'TECHNICIAN' && task.assignedToUserId !== requestingUser.id) {
    throw new AppError('Access denied', 403);
  }

  const newStatus = data.status as TaskStatus;
  const updateData: Record<string, unknown> = { status: newStatus };
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (newStatus === TaskStatus.DONE && !task.completedAt) {
    updateData.completedAt = new Date();
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    select: taskSelect,
  });

  // Gdy zadanie zrealizowane → zamknij zgłoszenie
  if (newStatus === TaskStatus.DONE) {
    await completeTicket(updated.ticketId);
  }

  await logActivity(prisma, {
    entityType: 'Task',
    entityId: id,
    actionType: 'STATUS_CHANGE',
    description: `Task ${task.taskNumber} status changed to ${newStatus}`,
    performedByUserId: requestingUser.id,
    metadata: { from: task.status, to: newStatus },
  });

  return updated;
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  requestingUser: { id: string; role: string }
) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError('Task not found', 404);

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.assignedToUserId !== undefined) updateData.assignedToUserId = data.assignedToUserId;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
  if (data.travelKm !== undefined) updateData.travelKm = data.travelKm;

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    select: taskSelect,
  });

  return updated;
}
