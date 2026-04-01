import { Request, Response, NextFunction } from 'express';
import {
  listCredentials,
  getCredentialById,
  revealCredential,
  createCredential,
  updateCredential,
  deleteCredential,
} from './credentials.service';
import { CredentialCategory } from '@prisma/client';
import { credentialScopeFilter, isCredentialAccessible } from '../../middleware/workspace';

export async function getCredentials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { locationId, deviceId, category, page, limit } = req.query as Record<string, string>;
    const result = await listCredentials({
      workspaceId: req.workspaceId,
      locationId,
      deviceId,
      category: category as CredentialCategory | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      scopeFilter: credentialScopeFilter(req.membership),
      requestingUser: req.user!,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const credential = await getCredentialById(req.params.id, req.user!);

    if (req.membership && !isCredentialAccessible(req.membership, {
      deviceId: credential.deviceId,
      locationId: credential.locationId,
      deviceLocationId: (credential.device as any)?.locationId ?? null,
    })) {
      res.status(403).json({ error: 'Credential not in your access scope' });
      return;
    }

    res.status(200).json(credential);
  } catch (err) {
    next(err);
  }
}

export async function revealCredentialPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await revealCredential(req.params.id, {
      userId: req.user!.userId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const credential = await createCredential(req.body, req.user!.userId);
    res.status(201).json(credential);
  } catch (err) {
    next(err);
  }
}

export async function patchCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const credential = await updateCredential(req.params.id, req.body, req.user!.userId);
    res.status(200).json(credential);
  } catch (err) {
    next(err);
  }
}

export async function removeCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteCredential(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
