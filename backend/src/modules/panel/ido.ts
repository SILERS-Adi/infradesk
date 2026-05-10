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

const OPEN_STATUSES = ['PENDING', 'ASSIGNED'] as const;

async function buildWorkspaceContext(userId: string, workspaceId: string): Promise<string> {
  const [
    user,
    ws,
    openTicketsCount,
    allTicketsCount,
    recentOpenTickets,
    devicesCount,
    alertsCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, taxId: true },
    }),
    prisma.ticket.count({
      where: { workspaceId, status: { in: [...OPEN_STATUSES] } as any },
    }),
    prisma.ticket.count({ where: { workspaceId } }),
    prisma.ticket.findMany({
      where: { workspaceId, status: { in: [...OPEN_STATUSES] } as any },
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
  lines.push('');
  lines.push('[LICZBY — TYLKO TE WARTOŚCI SĄ PRAWDZIWE]');
  lines.push(`- Urządzenia łącznie: ${devicesCount}`);
  lines.push(`- Aktywne alerty bezpieczeństwa: ${alertsCount}`);
  lines.push(`- Otwarte zgłoszenia (PENDING + ASSIGNED): ${openTicketsCount}`);
  lines.push(`- Wszystkie zgłoszenia w historii: ${allTicketsCount}`);
  lines.push('');

  if (recentOpenTickets.length > 0) {
    lines.push('[LISTA OSTATNICH OTWARTYCH ZGŁOSZEŃ — max 10 pokazanych, prawdziwa liczba otwartych wyżej]');
    for (const t of recentOpenTickets) {
      lines.push(`  #${t.ticketNumber ?? '—'} [${t.status}/${t.priority}] ${t.title}`);
    }
  } else {
    lines.push('[LISTA OTWARTYCH ZGŁOSZEŃ] — brak otwartych zgłoszeń');
  }

  lines.push('');
  lines.push('[TWARDE ZASADY — NIE ŁAM ICH]');
  lines.push('1. LICZB NIE WYMYŚLAJ. Jeśli user pyta "ile mam zgłoszeń" — podaj DOKŁADNIE tę liczbę z sekcji [LICZBY] wyżej (otwarte albo wszystkie, zależnie od kontekstu pytania).');
  lines.push('2. Widzisz dane TYLKO tej firmy. Nie wspominaj innych klientów, ani liczb z innych firm.');
  lines.push('3. Jeśli nie masz czegoś w kontekście — powiedz wprost "nie mam tego w danych, mogę założyć zgłoszenie". NIE zgaduj.');
  lines.push('4. Odpowiadaj krótko, po polsku, bez emoji.');
  lines.push('');
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
