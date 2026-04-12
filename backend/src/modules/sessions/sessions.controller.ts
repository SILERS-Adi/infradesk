import { Request, Response, NextFunction } from 'express';
import { startSession, endSession, getSessionsByClient, startMobileSession, pauseSession, resumeSession, getActiveTechSession, listAllSessions, updateSession, deleteSession } from './sessions.service';
import { sessionScopeFilter } from '../../middleware/workspace';

export async function postStart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const techId = req.user!.userId;
    const { agentRegId } = req.body as { agentRegId: string };
    if (!agentRegId) { res.status(400).json({ error: 'agentRegId required' }); return; }
    const session = await startSession(techId, agentRegId);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function patchEnd(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const techId = req.user!.userId;
    const { notes } = req.body as { notes?: string };
    const session = await endSession(req.params.id, techId, notes);
    res.json(session);
  } catch (err) { next(err); }
}

export async function getByClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Always use workspace from auth context — never from URL params
    const sessions = await getSessionsByClient(req.workspaceId!);
    res.json(sessions);
  } catch (err) { next(err); }
}

export async function postStartMobile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Override workspaceId from auth context — never trust client-provided value
    const session = await startMobileSession(req.user!.userId, { ...req.body, workspaceId: req.workspaceId! });
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

export async function getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { techId, from, to, page, limit } = req.query as Record<string, string>;
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    const result = await listAllSessions({
      workspaceId: wsIds.length === 1 ? wsIds[0] : undefined,
      workspaceIds: wsIds.length > 1 ? wsIds : undefined,
      techId, from, to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 200,
      scopeFilter: sessionScopeFilter(req.membership),
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function patchSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await updateSession(req.params.id, req.body, req.workspaceId!);
    res.json(session);
  } catch (err) { next(err); }
}

export async function removeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteSession(req.params.id, req.workspaceId!);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getActiveTechSession(req.user!.userId);
    res.json(session);
  } catch (err) { next(err); }
}
