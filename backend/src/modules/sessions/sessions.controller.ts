import { Request, Response, NextFunction } from 'express';
import { startSession, endSession, getSessionsByClient, startMobileSession, pauseSession, resumeSession, getActiveTechSession } from './sessions.service';

export async function postStart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const techId = (req as any).user.id as string;
    const { agentRegId } = req.body as { agentRegId: string };
    if (!agentRegId) { res.status(400).json({ error: 'agentRegId required' }); return; }
    const session = await startSession(techId, agentRegId);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function patchEnd(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const techId = (req as any).user.id as string;
    const { notes } = req.body as { notes?: string };
    const session = await endSession(req.params.id, techId, notes);
    res.json(session);
  } catch (err) { next(err); }
}

export async function getByClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessions = await getSessionsByClient(req.params.clientId);
    res.json(sessions);
  } catch (err) { next(err); }
}

export async function postStartMobile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await startMobileSession(req.user!.userId, req.body);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function postPause(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await pauseSession(req.params.id, req.user!.userId);
    res.json(session);
  } catch (err) { next(err); }
}

export async function postResume(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await resumeSession(req.params.id, req.user!.userId);
    res.json(session);
  } catch (err) { next(err); }
}

export async function getActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getActiveTechSession(req.user!.userId);
    res.json(session);
  } catch (err) { next(err); }
}
