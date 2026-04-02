import { Request, Response, NextFunction } from 'express';
import * as service from './packaging.service';
import { createShipmentSchema, updateShipmentSchema } from './packaging.validation';

export async function listShipments(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, courier, search, page, per_page } = req.query as Record<string, string>;
    const result = await service.listShipments({
      workspaceId: req.workspaceId!,
      status, courier, search,
      page: page ? parseInt(page) : 1,
      perPage: per_page ? parseInt(per_page) : 50,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function getShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await service.getShipment(req.params.id, req.workspaceId!);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json(shipment);
  } catch (err) { next(err); }
}

export async function createShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createShipmentSchema.parse(req.body);
    const shipment = await service.createShipment(data, req.workspaceId!, req.user!.userId);
    res.status(201).json(shipment);
  } catch (err) { next(err); }
}

export async function updateShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateShipmentSchema.parse(req.body);
    const shipment = await service.updateShipment(req.params.id, data, req.workspaceId!);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    res.json(shipment);
  } catch (err) { next(err); }
}

export async function deleteShipment(req: Request, res: Response, next: NextFunction) {
  try {
    const ok = await service.deleteShipment(req.params.id, req.workspaceId!);
    if (!ok) return res.status(404).json({ error: 'Shipment not found' });
    res.status(204).send();
  } catch (err) { next(err); }
}
