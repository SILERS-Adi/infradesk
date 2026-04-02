import { Request, Response, NextFunction } from 'express';
import * as service from './inspections.service';
import { createInspectionSchema, updateInspectionSchema } from './inspections.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, search, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listInspections({ workspaceId: req.workspaceId!, status, search, page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50 }));
  } catch (err) { next(err); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const i = await service.getInspection(req.params.id, req.workspaceId!);
    if (!i) { res.status(404).json({ error: 'Inspection not found' }); return; }
    res.json(i);
  } catch (err) { next(err); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createInspectionSchema.parse(req.body);
    const i = await service.createInspection(data, req.workspaceId!, req.user!.userId);
    if (!i) { res.status(404).json({ error: 'Vehicle not found' }); return; }
    res.status(201).json(i);
  } catch (err) { next(err); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const i = await service.updateInspection(req.params.id, updateInspectionSchema.parse(req.body), req.workspaceId!);
    if (!i) { res.status(404).json({ error: 'Inspection not found' }); return; }
    res.json(i);
  } catch (err) { next(err); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteInspection(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Inspection not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
