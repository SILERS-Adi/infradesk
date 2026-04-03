import { Request, Response, NextFunction } from 'express';
import * as service from './orders.service';
import { createOrderSchema, updateOrderSchema } from './orders.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, search, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listOrders({ workspaceId: req.workspaceId!, status, search, page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50 }));
  } catch (err) { next(err); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const o = await service.getOrder(req.params.id, req.workspaceId!);
    if (!o) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(o);
  } catch (err) { next(err); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await service.createOrder(createOrderSchema.parse(req.body), req.workspaceId!));
  } catch (err) { next(err); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const o = await service.updateOrder(req.params.id, updateOrderSchema.parse(req.body), req.workspaceId!);
    if (!o) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(o);
  } catch (err) { next(err); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteOrder(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Order not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
