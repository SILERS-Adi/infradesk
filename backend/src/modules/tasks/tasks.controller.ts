import { Request, Response, NextFunction } from 'express';
import * as tasksService from './tasks.service';
import { createTaskSchema, changeTaskStatusSchema, updateTaskSchema } from './tasks.validation';
import { TaskStatus } from '@prisma/client';

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.createTask(data, {
      id:   req.user!.userId,
      role: 'ADMIN',
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
}

export async function listTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, assignedToUserId, all } = req.query as Record<string, string>;
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    const isMsp = wsIds.length > 1;
    const tasks = await tasksService.listTasks({
      requestingUser: { id: req.user!.userId, role: 'ADMIN' },
      status: status as TaskStatus | undefined,
      assignedToUserId,
      all: all === 'true',
      workspaceId: isMsp ? undefined : req.workspaceId,
      workspaceIds: isMsp ? wsIds : undefined,
    });
    res.json(tasks);
  } catch (err) { next(err); }
}

export async function getTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [req.workspaceId!];
    const task = await tasksService.getTaskById(req.params.id, {
      id: req.user!.userId,
      role: 'ADMIN',
    }, req.workspaceId!, wsIds);
    res.json(task);
  } catch (err) { next(err); }
}

export async function changeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = changeTaskStatusSchema.parse(req.body);
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [req.workspaceId!];
    const task = await tasksService.changeTaskStatus(req.params.id, data, {
      id: req.user!.userId,
      role: 'ADMIN',
    }, req.workspaceId!, wsIds);
    res.json(task);
  } catch (err) { next(err); }
}

export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateTaskSchema.parse(req.body);
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [req.workspaceId!];
    const task = await tasksService.updateTask(req.params.id, data, {
      id: req.user!.userId,
      role: 'ADMIN',
    }, req.workspaceId!, wsIds);
    res.json(task);
  } catch (err) { next(err); }
}
