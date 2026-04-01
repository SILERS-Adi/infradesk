import { Request, Response, NextFunction } from 'express';
import { listUsers, getUserById, createUser, updateUser, deleteUser } from './users.service';

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { isActive, page, limit } = req.query as Record<string, string>;
    const result = await listUsers({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      workspaceId: req.workspaceId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUserById(req.params.id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function postUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await createUser(req.body, req.user!.userId, req.workspaceId);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function patchUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await updateUser(req.params.id, req.body, req.user!.userId);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export async function removeUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteUser(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
