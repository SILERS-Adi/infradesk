import { Request, Response, NextFunction } from 'express';
import * as service from './payments.service';
import { createPaymentSchema } from './payments.validation';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, status, page, per_page } = req.query as Record<string, string>;
    res.json(await service.listPayments({
      workspaceId: req.workspaceId!, search, status,
      page: page ? parseInt(page) : 1, perPage: per_page ? parseInt(per_page) : 50,
    }));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createPaymentSchema.parse(req.body);
    const payment = await service.createPayment(data, req.workspaceId!);
    if (!payment) { res.status(404).json({ error: 'Document not found' }); return; }
    res.status(201).json(payment);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deletePayment(req.params.id, req.workspaceId!);
    if (!ok) { res.status(404).json({ error: 'Payment not found' }); return; }
    res.status(204).send();
  } catch (err) { next(err); }
}
