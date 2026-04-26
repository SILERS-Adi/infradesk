import { Request, Response, NextFunction } from 'express';
import * as service from './crm.service';
import { listCrmQuerySchema } from './crm.validation';

export async function getActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listCrmQuerySchema.parse(req.query);
    const result = await service.listCrmActivities({ ...query, workspaceId: req.workspaceId! });
    res.json(result);
  } catch (err) { next(err); }
}

export async function getActivity(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.getCrmActivityById(req.params.id, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function postActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const activity = await service.createCrmActivity(req.body, req.user!.userId, req.workspaceId!);
    res.status(201).json(activity);
  } catch (err) { next(err); }
}

export async function patchActivity(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await service.updateCrmActivity(req.params.id, req.body, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function removeActivity(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteCrmActivity(req.params.id, req.workspaceId!);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    // Timeline always uses the authenticated user's workspace — never from URL params
    res.json(await service.getClientTimeline(req.workspaceId!));
  } catch (err) { next(err); }
}
