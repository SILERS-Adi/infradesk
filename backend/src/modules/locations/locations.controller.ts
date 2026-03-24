import { Request, Response, NextFunction } from 'express';
import { listLocations, getLocationById, createLocation, updateLocation, deleteLocation } from './locations.service';

export async function getLocations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId, page, limit } = req.query as Record<string, string>;
    const result = await listLocations({
      clientId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      requestingUser: req.user!,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await getLocationById(req.params.id, req.user!);
    res.status(200).json(location);
  } catch (err) {
    next(err);
  }
}

export async function postLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await createLocation(req.body, req.user!.userId);
    res.status(201).json(location);
  } catch (err) {
    next(err);
  }
}

export async function patchLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const location = await updateLocation(req.params.id, req.body, req.user!.userId);
    res.status(200).json(location);
  } catch (err) {
    next(err);
  }
}

export async function removeLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteLocation(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
