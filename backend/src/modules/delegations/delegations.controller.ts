import { Request, Response, NextFunction } from 'express';
import * as svc from './delegations.service';
import { createDelegationSchema, updateDelegationSchema } from './delegations.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedToUserId } = req.query as Record<string, string>;
    res.json(await svc.listDelegations({ assignedToUserId, workspaceId: req.workspaceId }));
  } catch (err) { next(err); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getDelegationById(req.params.id)); } catch (err) { next(err); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createDelegationSchema.parse(req.body);
    res.status(201).json(await svc.createDelegation(data, req.user!.userId));
  } catch (err) { next(err); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateDelegationSchema.parse(req.body);
    res.json(await svc.updateDelegation(req.params.id, data, req.user!.userId));
  } catch (err) { next(err); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteDelegation(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}
