import { Request, Response, NextFunction } from 'express';
import { listClients, getClientById, createClient, updateClient, deactivateClient, hardDeleteClient, checkTaxId, toggleFavorite as toggleFavoriteService, getUserFavoriteClientIds } from './clients.service';
import { ClientStatus } from '@prisma/client';

export async function getClients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, search, page, limit } = req.query as Record<string, string>;
    const result = await listClients({
      status: status as ClientStatus | undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await getClientById(req.params.id);
    res.status(200).json(client);
  } catch (err) {
    next(err);
  }
}

export async function postClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await createClient(req.body, req.user!.userId);
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
}

export async function patchClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await updateClient(req.params.id, req.body, req.user!.userId);
    res.status(200).json(client);
  } catch (err) {
    next(err);
  }
}

export async function checkNip(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { taxId, excludeId } = req.query as Record<string, string>;
    if (!taxId) { res.status(400).json({ error: 'taxId required' }); return; }
    res.json(await checkTaxId(taxId, excludeId));
  } catch (err) { next(err); }
}

export async function deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deactivateClient(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await hardDeleteClient(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function toggleFavorite(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await toggleFavoriteService(req.params.id, req.user!.userId);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getFavorites(req: Request, res: Response, next: NextFunction) {
  try {
    const ids = await getUserFavoriteClientIds(req.user!.userId);
    res.json(ids);
  } catch (err) { next(err); }
}
