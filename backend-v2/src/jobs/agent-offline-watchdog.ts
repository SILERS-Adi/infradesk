// Watchdog: alert mailowy gdy agent jest OFFLINE >24h.
// Działa co 60 min. Cooldown 24h per agent (przez ActivityLog marker)
// żeby nie spamować — jeden alert dziennie maksymalnie.
//
// Bez tego user dowiaduje się o problemach z agentem dopiero gdy backup nie poszedł (np. po 3 dniach).

import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';
import { sendMail, escape } from '../lib/mailer';

const TICK_INTERVAL_MS = 60 * 60_000;   // co 1h
const FIRST_TICK_DELAY_MS = 15 * 60_000; // 15 min po starcie
const OFFLINE_THRESHOLD_MS = 24 * 60 * 60_000; // 24h
const ALERT_COOLDOWN_MS = 24 * 60 * 60_000;    // jedna notyfikacja / 24h / agent

let handle: NodeJS.Timeout | null = null;

interface OfflineAgent {
  id: string;
  hostname: string;
  lastSeen: Date | null;
  workspaceId: string;
}

async function findOfflineAgents(): Promise<OfflineAgent[]> {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  return prismaBg.agentRegistration.findMany({
    where: {
      status: 'ACTIVE',
      lastSeen: { lt: cutoff },
    },
    select: { id: true, hostname: true, lastSeen: true, workspaceId: true },
  });
}

async function alreadyAlerted(agentId: string): Promise<boolean> {
  const since = new Date(Date.now() - ALERT_COOLDOWN_MS);
  const found = await prismaBg.activityLog.findFirst({
    where: {
      entityType: 'agent',
      entityId: agentId,
      actionType: 'agent_offline_alert_sent',
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return found != null;
}

async function alertOne(a: OfflineAgent): Promise<void> {
  if (await alreadyAlerted(a.id)) return;

  const ws = await prismaBg.workspace.findUnique({
    where: { id: a.workspaceId },
    select: { name: true },
  });
  const admins = await prismaBg.membership.findMany({
    where: { workspaceId: a.workspaceId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
    select: { user: { select: { email: true, firstName: true, isActive: true } } },
  });
  const recipients = admins
    .map((m) => m.user)
    .filter((u): u is { email: string; firstName: string; isActive: boolean } => !!u && u.isActive && !!u.email);
  if (recipients.length === 0) return;

  const lastSeenText = a.lastSeen
    ? a.lastSeen.toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'nigdy';
  const hoursOffline = a.lastSeen
    ? Math.floor((Date.now() - a.lastSeen.getTime()) / 60 / 60_000)
    : 999;

  // SECURITY: hostname pochodzi z agenta (rejestracja), workspace.name z user input.
  // Bez escape() każdy klient mógł wstrzyknąć link/HTML do maili adminów MSP.
  const safeHost = escape(a.hostname);
  const safeWs = escape(ws?.name ?? '?');
  const subject = `⚠️ Asystent ${a.hostname} offline ${hoursOffline}h`;
  const text = `Agent na "${a.hostname}" (workspace ${ws?.name ?? '?'}) nie raportował od ${lastSeenText} (${hoursOffline}h temu).\n\nMożliwe przyczyny: usługa zatrzymana, brak internetu, restart bez auto-startu, awaria sprzętu.\n\nSprawdź w panelu:\nhttps://infradesk.pl/agents\n\n— InfraDesk monitoring`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
      <div style="background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;display:inline-block;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.05em;margin-bottom:16px">
        Asystent offline
      </div>
      <h2 style="font-size:18px;margin:0 0 16px"><strong>${safeHost}</strong> nie raportuje od <strong>${hoursOffline}h</strong></h2>
      <p>Workspace: <strong>${safeWs}</strong></p>
      <p style="color:#6b7280;font-size:13px">Ostatni raport: ${lastSeenText}</p>
      <p style="margin:18px 0">Bez aktywnego agenta nie pójdą:</p>
      <ul style="color:#6b7280;font-size:13px">
        <li>Backupy harmonogramowane (cron)</li>
        <li>Audyty bezpieczeństwa (codzienne)</li>
        <li>Komendy zdalne z panelu</li>
        <li>Telemetria CPU/RAM/dysk</li>
      </ul>
      <p style="text-align:center;margin:28px 0">
        <a href="https://infradesk.pl/agents" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
          Zobacz w panelu
        </a>
      </p>
      <p style="color:#9ca3af;font-size:12px">Najczęstsze przyczyny: usługa zatrzymana, restart bez auto-start, brak internetu.</p>
    </div>`;

  await Promise.all(recipients.map((u) => sendMail({
    to: u.email,
    subject,
    text,
    html,
  })));

  // Marker żeby nie spamować
  await prismaBg.activityLog.create({
    data: {
      workspaceId: a.workspaceId,
      entityType: 'agent',
      entityId: a.id,
      actionType: 'agent_offline_alert_sent',
      description: `Alert wysłany — Asystent ${a.hostname} offline ${hoursOffline}h`,
      performedByUserId: null,
      metadata: { hostname: a.hostname, hoursOffline, lastSeen: a.lastSeen?.toISOString() ?? null },
    },
  }).catch((err: unknown) => logger.warn({ err, agentId: a.id }, '[agent-offline-watchdog] activity log failed'));

  logger.warn({ agentId: a.id, hostname: a.hostname, hoursOffline }, '[agent-offline-watchdog] alert sent');
}

export async function runAgentOfflineSweep(): Promise<{ found: number; alerted: number }> {
  const offline = await findOfflineAgents();
  if (offline.length === 0) return { found: 0, alerted: 0 };
  let alerted = 0;
  for (const a of offline) {
    try {
      await alertOne(a);
      alerted++;
    } catch (err) {
      logger.warn({ err, agentId: a.id }, '[agent-offline-watchdog] one agent failed');
    }
  }
  return { found: offline.length, alerted };
}

export function startAgentOfflineWatchdog(): void {
  if (handle) return;
  logger.info('[agent-offline-watchdog] scheduler started — interval 60min');
  handle = setTimeout(async function loop() {
    try {
      const r = await runAgentOfflineSweep();
      if (r.found > 0) logger.info(r, '[agent-offline-watchdog] sweep complete');
    } catch (err) {
      logger.warn({ err }, '[agent-offline-watchdog] sweep error');
    } finally {
      handle = setTimeout(loop, TICK_INTERVAL_MS);
    }
  }, FIRST_TICK_DELAY_MS);
}

export function stopAgentOfflineWatchdog(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[agent-offline-watchdog] scheduler stopped');
  }
}
