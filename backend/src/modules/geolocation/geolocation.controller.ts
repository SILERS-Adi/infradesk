import { Request, Response, NextFunction } from 'express';
import { updateTechPosition, getNearbyTickets } from './geolocation.service';

export async function postPosition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { latitude, longitude, accuracy } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ error: 'latitude and longitude are required numbers' });
      return;
    }
    const result = await updateTechPosition(req.user!.userId, latitude, longitude, accuracy);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getNearbytTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = req.query.radius ? parseInt(req.query.radius as string) : 500;
    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'lat and lng query params required' });
      return;
    }
    const tickets = await getNearbyTickets(lat, lng, radius);
    res.json(tickets);
  } catch (err) { next(err); }
}
