import { Request, Response, NextFunction } from 'express';
import { listLocations, getLocationById, createLocation, updateLocation, deleteLocation } from './locations.service';
import { locationScopeFilter, isLocationAccessible } from '../../middleware/workspace';

export async function getLocations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = req.query as Record<string, string>;
    const result = await listLocations({
      workspaceId: req.workspaceId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      scopeFilter: locationScopeFilter(req.membership),
      requestingUser: req.user!,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await getLocationById(req.params.id, req.workspaceId!, req.user!);

    // Enforce scope on detail endpoint
    if (req.membership && !isLocationAccessible(req.membership, location.id)) {
      res.status(403).json({ error: 'Location not in your access scope' });
      return;
    }

    res.status(200).json(location);
  } catch (err) {
    next(err);
  }
}

export async function postLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await createLocation({ ...req.body, workspaceId: req.workspaceId! }, req.user!.userId);
    res.status(201).json(location);
  } catch (err) {
    next(err);
  }
}

export async function patchLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await updateLocation(req.params.id, req.body, req.user!.userId, req.workspaceId!);
    res.status(200).json(location);
  } catch (err) {
    next(err);
  }
}

export async function removeLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteLocation(req.params.id, req.user!.userId, req.workspaceId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
