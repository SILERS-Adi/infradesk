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
import { ticketScopeFilter, isTicketAccessible } from '../../middleware/workspace';

export async function getTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locationId, deviceId, status, priority, type, assignedToUserId, unassigned, search, page, limit, clientWorkspaceId } =
      req.query as Record<string, string>;
    // MSP scope: include client workspaces
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    let wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    if (clientWorkspaceId && wsIds.includes(clientWorkspaceId)) {
      wsIds = [clientWorkspaceId];
    }
    const result = await listTickets({
      workspaceId: wsIds.length === 1 ? wsIds[0] : undefined,
      workspaceIds: wsIds.length > 1 ? wsIds : undefined,
      locationId,
      deviceId,
      status: status as TicketStatus | undefined,
      priority: priority as TicketPriority | undefined,
      type: type as TicketType | undefined,
      assignedToUserId,
      unassigned: unassigned === 'true',
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : (wsIds.length > 1 ? 200 : 20),
      scopeFilter: ticketScopeFilter(req.membership),
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

    // Enforce scope on detail
    if (req.membership && !isTicketAccessible(req.membership, {
      deviceId: ticket.deviceId,
      locationId: ticket.locationId,
      deviceLocationId: null,
    })) {
      res.status(403).json({ error: 'Ticket not in your access scope' });
      return;
    }

    res.status(200).json(ticket);
  } catch (err) {
    next(err);
  }
}

export async function postTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await createTicket(req.body, {
      userId: req.user!.userId,
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
