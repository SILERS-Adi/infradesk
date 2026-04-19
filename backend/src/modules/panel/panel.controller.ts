import { Request, Response } from 'express';
import { getPanelPulse, getPanelTiles, getPanelActivity } from './panel.service';

export async function pulse(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || (req as any).user?.workspaceId || null;
    const data = await getPanelPulse(workspaceId);
    res.json(data);
  } catch (err: any) {
    console.error('[panel.pulse]', err);
    res.status(500).json({ error: 'panel_pulse_failed', message: err?.message });
  }
}

export async function tiles(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || (req as any).user?.workspaceId || null;
    const role = (req as any).workspaceRole || (req as any).user?.role || 'MEMBER';
    const data = await getPanelTiles(workspaceId, role);
    res.json(data);
  } catch (err: any) {
    console.error('[panel.tiles]', err);
    res.status(500).json({ error: 'panel_tiles_failed', message: err?.message });
  }
}

export async function activity(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || (req as any).user?.workspaceId || null;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const data = await getPanelActivity(workspaceId, limit);
    res.json({ items: data });
  } catch (err: any) {
    console.error('[panel.activity]', err);
    res.status(500).json({ error: 'panel_activity_failed', message: err?.message });
  }
}
