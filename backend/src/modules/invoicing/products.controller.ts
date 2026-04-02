import { Request, Response, NextFunction } from 'express';
import * as service from './products.service';
import { createProductSchema, updateProductSchema } from './products.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listProducts({
      workspaceId: req.workspaceId!, search,
      page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50,
    }));
  } catch (err) { next(err); }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await service.getProduct(req.params.id, req.workspaceId!);
    if (!p) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json(p);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createProductSchema.parse(req.body);
    res.status(201).json(await service.createProduct(data, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateProductSchema.parse(req.body);
    const p = await service.updateProduct(req.params.id, data, req.workspaceId!);
    if (!p) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json(p);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteProduct(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Product not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
