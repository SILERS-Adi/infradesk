import { Request, Response, NextFunction } from 'express';
import {
  listTickets,
  getTicketById,
  createTicket,
  updateTicket,
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  cancelTicket as cancelTicketService,
  deleteTicket,
} from './tickets.service';
import { TicketStatus, TicketPriority, TicketType } from '@prisma/client';

export async function getTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId, locationId, deviceId, status, priority, type, assignedToUserId, unassigned, search, page, limit } =
      req.query as Record<string, string>;
    const result = await listTickets({
      clientId,
      locationId,
      deviceId,
      status: status as TicketStatus | undefined,
      priority: priority as TicketPriority | undefined,
      type: type as TicketType | undefined,
      assignedToUserId,
      unassigned: unassigned === 'true',
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      requestingUser: req.user!,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await getTicketById(req.params.id, req.user!);
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function postTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await createTicket(req.body, {
      userId: req.user!.userId,
      role: req.user!.role,
      clientId: req.user!.clientId,
    });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function patchTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await updateTicket(req.params.id, req.body, req.user!.userId);
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function postComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await addTicketComment(req.params.id, req.body, {
      userId: req.user!.userId,
      role: req.user!.role,
      clientId: req.user!.clientId,
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

export async function postAssign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await assignTicket(req.params.id, req.body, req.user!.userId);
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function postStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await changeTicketStatus(req.params.id, req.body, req.user!.userId);
    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function cancelTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await cancelTicketService(req.params.id, req.user!.userId);
    res.json(ticket);
  } catch (err) { next(err); }
}

export async function removeTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteTicket(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
