import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import {
  registerAgent, updateMetrics, createAgentTicket,
  getAllRegistrations, approveRegistration, approveRegistrationWithNewClient, deleteRegistration,
} from './agent.service';

/**
 * Fetch agent registration by ID, verifying it belongs to the requester's workspace.
 * MSP operators can access agents in client workspaces.
 * Returns null if not found or workspace mismatch.
 */
async function findAgentInWorkspace(id: string, workspaceId?: string | null) {
  if (!workspaceId) return null;
  const { getMspWorkspaceIds } = require('../../utils/mspScope');
  const wsIds = await getMspWorkspaceIds(workspaceId);
  return prisma.agentRegistration.findFirst({
    where: { id, workspaceId: wsIds.length > 1 ? { in: wsIds } : workspaceId },
  });
}

// Token auth middleware (for agent endpoints)
export async function agentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Token required' }); return; }
  const token = auth.slice(7);
  (req as any).agentToken = token;
  next();
}

export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req as any).agentToken as string;
    const reg = await prisma.agentRegistration.findUnique({
      where: { agentToken: token },
      select: { id: true, status: true, deviceId: true },
    });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ status: reg.status, deviceId: reg.deviceId });
  } catch (err) { next(err); }
}

export async function postRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await registerAgent(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function postMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req as any).agentToken as string;
    await updateMetrics(token, req.body);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function postTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req as any).agentToken as string;
    const ticket = await createAgentTicket(token, req.body);
    res.status(201).json(ticket);
  } catch (err) { next(err); }
}

export async function getRegistrations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { agentScopeFilter } = await import('../../middleware/workspace');
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    const isMsp = wsIds.length > 1;
    const regs = await getAllRegistrations({
      workspaceId: isMsp ? undefined : req.workspaceId,
      workspaceIds: isMsp ? wsIds : undefined,
      scopeFilter: agentScopeFilter(req.membership),
      includePendingUnassigned: isMsp, // MSP widzi PENDING agentów bez workspace
    });
    res.json(regs);
  } catch (err) { next(err); }
}

export async function postApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await approveRegistration(req.params.id, req.body, req.user?.userId);
    res.json(result);
  } catch (err) { next(err); }
}

export async function postApproveNewClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await approveRegistrationWithNewClient(req.params.id, req.body, req.user?.userId);
    res.json(result);
  } catch (err) { next(err); }
}

export async function postPushUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    notifyAgent(reg.agentToken, { type: 'update' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function postWindowsUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    const { scheduleTime } = req.body as { scheduleTime?: string };
    notifyAgent(reg.agentToken, { type: 'windows_update', scheduleTime: scheduleTime || null });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function postRestartService(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    const { serviceName } = req.body as { serviceName: string };
    if (!serviceName) { res.status(400).json({ error: 'serviceName required' }); return; }
    notifyAgent(reg.agentToken, { type: 'restart_service', serviceName });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function postSystemReboot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    const { delay } = req.body as { delay?: number };
    notifyAgent(reg.agentToken, { type: 'system_reboot', delay: delay ?? 60 });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Generic WS notify — panel can trigger agent commands like speedtest, schedule_task, install_software. */
const ALLOWED_NOTIFY_TYPES = new Set([
  'speedtest', 'schedule_task', 'install_software', 'update', 'wake',
]);
export async function postNotify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as { type?: string; [k: string]: any };
    const type = body?.type || '';
    if (!ALLOWED_NOTIFY_TYPES.has(type)) {
      res.status(400).json({ error: `type '${type}' not allowed` });
      return;
    }
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    notifyAgent(reg.agentToken, body);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteReg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteRegistration(req.params.id, req.user?.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function postWakeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: req.params.id, ...(req.workspaceId ? { workspaceId: req.workspaceId } : {}) },
      include: { device: { select: { macAddress: true } } },
    });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    const mac = reg.device?.macAddress;
    if (!mac) { res.status(400).json({ error: 'Urządzenie nie ma zapisanego adresu MAC' }); return; }
    if (!reg.workspaceId) { res.status(400).json({ error: 'Urządzenie nie jest przypisane do workspace' }); return; }

    // Znajdź inne aktywne agenty tego workspace — muszą być na tej samej LAN żeby wysłać magic packet
    const relayAgents = await prisma.agentRegistration.findMany({
      where: { workspaceId: reg.workspaceId, status: 'ACTIVE', id: { not: reg.id } },
    });

    if (relayAgents.length === 0) {
      res.status(400).json({ error: 'Brak innych aktywnych agentów na tej sieci — nie można wysłać pakietu WoL' });
      return;
    }

    for (const relay of relayAgents) {
      notifyAgent(relay.agentToken, { type: 'wake', mac });
    }

    res.json({ ok: true, mac, relayAgents: relayAgents.length });
  } catch (err) { next(err); }
}

export async function getAuditData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getAuditOverview } = await import('./agent.service');
    const data = await getAuditOverview(req.workspaceId);
    res.json(data);
  } catch (err) { next(err); }
}

export async function getConnectPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Security: verify agent belongs to requesting user's workspace
    const reg = await findAgentInWorkspace(req.params.id, req.workspaceId);
    if (!reg?.rustdeskId) { res.status(400).json({ error: 'Brak RustDesk ID' }); return; }
    const { generateOneTimePassword } = await import('../../utils/rustdesk');
    const password = await generateOneTimePassword(reg.rustdeskId as string);
    res.json({ password, rustdeskId: reg.rustdeskId });
  } catch (err) { next(err); }
}

/* ── RustDesk integration endpoints ─────────────────────────────────────── */

export async function getRustdeskPeers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getRustDeskPeers } = await import('../../utils/rustdesk');
    const peers = await getRustDeskPeers();

    // Enrich with InfraDesk device info
    const where: any = { rustdeskId: { not: null } };
    if (req.workspaceId) where.workspaceId = req.workspaceId;
    const devices = await prisma.device.findMany({ where, select: { id: true, name: true, rustdeskId: true } });
    const deviceMap = new Map(devices.map(d => [d.rustdeskId, d]));

    const enriched = peers.map(p => {
      const device = deviceMap.get(p.id);
      return {
        rustdeskId: p.id,
        online: p.is_online,
        lastOnline: p.last_online,
        deviceName: p.info?.device_name ?? null,
        ip: p.info?.ip?.replace('::ffff:', '') ?? null,
        os: p.info?.os ?? null,
        cpu: p.info?.cpu ?? null,
        memory: p.info?.memory ?? null,
        version: p.info?.version ?? null,
        username: p.info?.username ?? null,
        infradesk: device ? { deviceId: device.id, deviceName: device.name } : null,
      };
    });

    res.json({ total: enriched.length, online: enriched.filter(p => p.online).length, peers: enriched });
  } catch (err) { next(err); }
}

export async function getRustdeskSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const { getRustDeskAuditConns } = await import('../../utils/rustdesk');
    const result = await getRustDeskAuditConns(page, limit);

    // Enrich with device names from InfraDesk
    const where: any = { rustdeskId: { not: null } };
    if (req.workspaceId) where.workspaceId = req.workspaceId;
    const devices = await prisma.device.findMany({ where, select: { id: true, name: true, rustdeskId: true } });
    const deviceMap = new Map(devices.map(d => [d.rustdeskId, d]));

    const sessions = result.data.map(c => {
      const remoteDevice = deviceMap.get(c.remote);
      const localDevice = deviceMap.get(c.local);
      const info = typeof c.info === 'string' ? (() => { try { return JSON.parse(c.info as string); } catch { return {}; } })() : (c.info ?? {});
      return {
        id: c.guid,
        remoteId: c.remote,
        remoteName: info?.name ?? remoteDevice?.name ?? null,
        remoteIp: info?.ip ?? null,
        remoteDevice: remoteDevice ? { id: remoteDevice.id, name: remoteDevice.name } : null,
        localId: c.local,
        localDevice: localDevice ? { id: localDevice.id, name: localDevice.name } : null,
        connType: c.conn_type,
        startedAt: c.created_at,
        endedAt: c.end_time,
        running: !c.end_time,
      };
    });

    res.json({ total: result.total, page, limit, sessions });
  } catch (err) { next(err); }
}

export async function postRustdeskSync(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { syncPeersWithDevices } = await import('../../utils/rustdesk');
    const result = await syncPeersWithDevices(prisma, req.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getRustdeskActiveSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { getActiveRustDeskSessions } = await import('../../utils/rustdesk');
    const sessions = await getActiveRustDeskSessions(prisma, req.workspaceId);
    res.json(sessions);
  } catch (err) { next(err); }
}

export async function postRustdeskSyncSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { syncCompletedRustDeskSessions } = await import('../../utils/rustdesk');
    const result = await syncCompletedRustDeskSessions(prisma, req.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
}
