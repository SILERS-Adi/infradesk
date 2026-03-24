import { Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate';
import prisma from '../../lib/prisma';
import {
  registerAgent, updateMetrics, createAgentTicket,
  getAllRegistrations, approveRegistration, approveRegistrationWithNewClient, deleteRegistration,
} from './agent.service';
import {
  registerSchema, metricsSchema, agentTicketSchema, approveSchema,
} from './agent.validation';

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
      select: { id: true, status: true, clientId: true, deviceId: true },
    });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ status: reg.status, clientId: reg.clientId, deviceId: reg.deviceId });
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
    const regs = await getAllRegistrations();
    res.json(regs);
  } catch (err) { next(err); }
}

export async function postApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await approveRegistration(req.params.id, req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function postApproveNewClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await approveRegistrationWithNewClient(req.params.id, req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function postPushUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await prisma.agentRegistration.findUnique({ where: { id: req.params.id } });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    notifyAgent(reg.agentToken, { type: 'update' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteReg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteRegistration(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function postWakeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await prisma.agentRegistration.findUnique({ where: { id: req.params.id } });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    if (!reg.macAddress) { res.status(400).json({ error: 'Urządzenie nie ma zapisanego adresu MAC' }); return; }
    if (!reg.clientId) { res.status(400).json({ error: 'Urządzenie nie jest przypisane do klienta' }); return; }

    // Znajdź inne aktywne agenty tego klienta — muszą być na tej samej LAN żeby wysłać magic packet
    const relayAgents = await prisma.agentRegistration.findMany({
      where: { clientId: reg.clientId, status: 'ACTIVE', id: { not: reg.id } },
    });

    if (relayAgents.length === 0) {
      res.status(400).json({ error: 'Brak innych aktywnych agentów na tej sieci — nie można wysłać pakietu WoL' });
      return;
    }

    for (const relay of relayAgents) {
      notifyAgent(relay.agentToken, { type: 'wake', mac: reg.macAddress });
    }

    res.json({ ok: true, mac: reg.macAddress, relayAgents: relayAgents.length });
  } catch (err) { next(err); }
}

export async function getConnectPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reg = await (prisma.agentRegistration.findUnique as any)({
      where: { id: req.params.id },
    });
    if (!reg?.rustdeskId) { res.status(400).json({ error: 'Brak RustDesk ID' }); return; }
    const { generateOneTimePassword } = await import('../../utils/rustdesk');
    const password = await generateOneTimePassword(reg.rustdeskId as string);
    res.json({ password, rustdeskId: reg.rustdeskId });
  } catch (err) { next(err); }
}
