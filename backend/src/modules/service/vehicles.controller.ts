import { Request, Response, NextFunction } from 'express';
import * as service from './vehicles.service';
import { createVehicleSchema, updateVehicleSchema } from './vehicles.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listVehicles({ workspaceId: req.workspaceId!, search, page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50 }));
  } catch (err) { next(err); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const v = await service.getVehicle(req.params.id, req.workspaceId!);
    if (!v) { res.status(404).json({ error: 'Vehicle not found' }); return; }
    res.json(v);
  } catch (err) { next(err); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createVehicle(createVehicleSchema.parse(req.body), req.workspaceId!));
  } catch (err) { next(err); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const v = await service.updateVehicle(req.params.id, updateVehicleSchema.parse(req.body), req.workspaceId!);
    if (!v) { res.status(404).json({ error: 'Vehicle not found' }); return; }
    res.json(v);
  } catch (err) { next(err); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteVehicle(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Vehicle not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
