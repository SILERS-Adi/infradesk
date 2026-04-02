import { Request, Response, NextFunction } from 'express';
import * as service from './contractors.service';
import { createContractorSchema, updateContractorSchema } from './contractors.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listContractors({
      workspaceId: req.workspaceId!,
      search, page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50,
    }));
  } catch (err) { next(err); }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const c = await service.getContractor(req.params.id, req.workspaceId!);
    if (!c) { res.status(404).json({ error: 'Contractor not found' }); return; }
    res.json(c);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createContractorSchema.parse(req.body);
    res.status(201).json(await service.createContractor(data, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateContractorSchema.parse(req.body);
    const c = await service.updateContractor(req.params.id, data, req.workspaceId!);
    if (!c) { res.status(404).json({ error: 'Contractor not found' }); return; }
    res.json(c);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteContractor(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Contractor not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
