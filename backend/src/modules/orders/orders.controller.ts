import { Request, Response, NextFunction } from 'express';
import * as ordersService from './orders.service';
import { createOrderSchema, changeOrderStatusSchema } from './orders.validation';
import { OrderStatus } from '@prisma/client';

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as Record<string, string>;
    const orders = await ordersService.listOrders({
      status: status as OrderStatus | undefined,
      workspaceId: req.workspaceId,
    });
    res.json(orders);
  } catch (err) { next(err); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await ordersService.getOrderById(req.params.id, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createOrderSchema.parse(req.body);
    res.status(201).json(await ordersService.createOrder({ ...data, workspaceId: req.workspaceId! }, req.user!.userId));
  } catch (err) { next(err); }
}

export async function changeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = changeOrderStatusSchema.parse(req.body);
    res.json(await ordersService.changeOrderStatus(req.params.id, data, req.user!.userId, req.workspaceId!));
  } catch (err) { next(err); }
}

export async function deleteOrder(req: Request, res: Response, next: NextFunction) {
  try {
    await ordersService.deleteOrder(req.params.id, req.user!.userId, req.workspaceId!);
    res.status(204).send();
  } catch (err) { next(err); }
}
