/**
 * panel.ido — IDO chat relay for client panel.
 * Proxies user message to ID CORE (/api/command agentName=ido) with
 * workspace-scoped context prefix. IDO lives in ID CORE; this endpoint is
 * the bridge from InfraDesk panel UI.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';

const IDCORE_URL   = process.env.IDCORE_URL   || 'http://172.18.0.1:4300';
const IDCORE_TOKEN = process.env.IDCORE_TOKEN || 'idcore-adrian-2026-secure';

async function buildWorkspaceContext(userId: string, workspaceId: string): Promise<string> {
  const [user, ws, tickets, devices, alerts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, taxId: true } }),
    prisma.ticket.findMany({
      where: { workspaceId, status: { in: ['PENDING', 'ASSIGNED'] as any } },
      select: { ticketNumber: true, title: true, status: true, priority: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.device.count({ where: { workspaceId } }),
    prisma.monitoringAlert.count({ where: { workspaceId, resolved: false } }),
  ]);

  const lines: string[] = [];
  lines.push(`[KONTEKST USERA] Rozmawiam z: ${user?.firstName ?? ''} ${user?.lastName ?? ''} (${user?.email ?? '—'})`);
  lines.push(`[FIRMA KLIENTA] ${ws?.name ?? '—'}${ws?.taxId ? ` · NIP ${ws.taxId}` : ''}`);
  lines.push(`[STATUS] Urządzeń: ${devices}, aktywnych alertów: ${alerts}, otwartych zgłoszeń: ${tickets.length}`);
  if (tickets.length > 0) {
    lines.push(`[OSTATNIE ZGŁOSZENIA]`);
    for (const t of tickets.slice(0, 5)) {
      lines.push(`  #${t.ticketNumber ?? '—'} [${t.status}/${t.priority}] ${t.title}`);
    }
  }
  lines.push(``);
  lines.push(`[WAŻNE ZASADY]`);
  lines.push(`- Widzisz TYLKO dane tego klienta. Nie wspominaj innych firm.`);
  lines.push(`- Jeżeli user pyta o coś czego nie umiesz — powiedz wprost i zaproponuj utworzenie zgłoszenia.`);
  lines.push(`- Odpowiadaj krótko i po polsku. Bez emoji w biznesowym kontekście.`);
  lines.push(``);
  return lines.join('\n');
}

export async function chat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) { res.status(400).json({ error: 'message required' }); return; }
    if (!req.user?.userId) { res.status(401).json({ error: 'auth required' }); return; }
    if (!req.workspaceId) { res.status(400).json({ error: 'workspace context required' }); return; }

    const context = await buildWorkspaceContext(req.user.userId, req.workspaceId);
    const fullMessage = `${context}\n[PYTANIE USERA]\n${message.trim()}`;

    const started = Date.now();
    const r = await fetch(`${IDCORE_URL}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${IDCORE_TOKEN}`,
      },
      body: JSON.stringify({ message: fullMessage, agentName: 'ido' }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      res.status(502).json({ error: 'idcore unavailable', detail: txt.slice(0, 200) });
      return;
    }

    const data = await r.json() as { response?: string; conversationId?: string; messageId?: string };
    res.json({
      response: data.response ?? '',
      durationMs: Date.now() - started,
      conversationId: data.conversationId,
      messageId: data.messageId,
    });
  } catch (err) {
    next(err);
  }
}
