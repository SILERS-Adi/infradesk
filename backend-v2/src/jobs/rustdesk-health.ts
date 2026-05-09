// Watchdog dla cron'a sync-rustdesk-sessions.ts.
// Co 30 min sprawdza /tmp/rustdesk-state.json i alertuje super-adminów mailem gdy:
//  1. Ostatni sync >60 min temu (cron padł)
//  2. >10 unmatched RustDesk connection (devices bez ustawionego rustdeskId)
//
// Cooldown: max 1 alert tego samego rodzaju na 24h (zapamiętany w state file).

import fs from 'node:fs';
import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';

const TICK_INTERVAL_MS = 30 * 60_000; // co 30 min
const FIRST_TICK_DELAY_MS = 5 * 60_000; // 5 min po starcie (po imap-sync, trial-expiry)
const STATE_FILE = process.env.RUSTDESK_STATE_FILE || '/tmp/rustdesk-state.json';
const STALE_AFTER_MIN = 60;
const UNMATCHED_THRESHOLD = 10;
const ALERT_COOLDOWN_MS = 24 * 60 * 60_000;

interface State {
  lastSyncAt?: string | null;
  created?: number;
  skippedSynced?: number;
  skippedNoDevice?: number;
  unmatchedCount?: number;
  unmatchedSample?: string[];
  lastError?: string;
  lastErrorAt?: string;
  // watchdog cooldown markers
  staleAlertSentAt?: string;
  unmatchedAlertSentAt?: string;
}

let handle: NodeJS.Timeout | null = null;

function readState(): State | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State;
  } catch (err) {
    logger.warn({ err }, '[rustdesk-health] state read failed');
    return null;
  }
}

function writeState(state: State): void {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
  catch (err) { logger.warn({ err }, '[rustdesk-health] state write failed'); }
}

async function getSuperAdmins(): Promise<Array<{ email: string; firstName: string }>> {
  const users = await prismaBg.user.findMany({
    where: { isSuperAdmin: true, isActive: true, deletedAt: null },
    select: { email: true, firstName: true },
  });
  return users;
}

async function alertStale(state: State, minutesAgo: number): Promise<void> {
  const lastSent = state.staleAlertSentAt ? new Date(state.staleAlertSentAt).getTime() : 0;
  if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return;

  const admins = await getSuperAdmins();
  if (admins.length === 0) return;

  const subject = '⚠️ RustDesk sync STALE — sprawdź cron';
  const errLine = state.lastError ? `\nOstatni błąd (${state.lastErrorAt}):\n${state.lastError}\n` : '';
  const text =
    `Sync RustDesk → WorkSession nie odpalał się od ${minutesAgo} min.\n\n` +
    `Cron powinien być co 10 min. Sprawdź:\n` +
    `  ssh ${process.env.DEPLOY_HOST ?? 'adrian@<server> -p <port>'}\n` +
    `  crontab -l\n` +
    `  tail -50 /tmp/rustdesk-sync.log\n${errLine}\n— InfraDesk monitoring`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;display:inline-block;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.05em;margin-bottom:16px">
        RustDesk sync stale
      </div>
      <p>Cron <code>sync-rustdesk-sessions.ts</code> nie zakończył się powodzeniem od <strong>${minutesAgo} min</strong>.</p>
      ${state.lastError ? `<p style="background:#fef2f2;padding:10px;border-radius:6px;font-family:monospace;font-size:12px;color:#991b1b">${state.lastError}</p>` : ''}
      <p>Sprawdź log:</p>
      <pre style="background:#f3f4f6;padding:12px;border-radius:6px;font-size:12px;overflow:auto">ssh ${process.env.DEPLOY_HOST ?? 'adrian@<server> -p <port>'}
crontab -l
tail -50 /tmp/rustdesk-sync.log</pre>
    </div>`;

  await Promise.all(admins.map((u) => sendMail({ to: u.email, subject, text, html })));
  state.staleAlertSentAt = new Date().toISOString();
  writeState(state);
  logger.warn({ minutesAgo, admins: admins.length }, '[rustdesk-health] stale alert sent');
}

async function alertUnmatched(state: State, count: number): Promise<void> {
  const lastSent = state.unmatchedAlertSentAt ? new Date(state.unmatchedAlertSentAt).getTime() : 0;
  if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return;

  const admins = await getSuperAdmins();
  if (admins.length === 0) return;

  const sample = (state.unmatchedSample ?? []).slice(0, 10).join(', ');
  const subject = `${count} sesji RustDesk bez przypisanego urządzenia`;
  const text =
    `${count} sesji w RustDesk audit logu nie ma odpowiadającego urządzenia w panelu.\n\n` +
    `Przykładowe ID: ${sample}\n\n` +
    `Co zrobić: edytuj urządzenia w https://infradesk.pl/devices i ustaw "RustDesk ID" — sync od następnego ticka rozpozna sesje.\n\n— InfraDesk monitoring`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px">${count} sesji RustDesk bez przypisanego urządzenia</h2>
      <p>Sesje pojawiają się w audit logu RustDesk, ale w panelu nie ma urządzeń z odpowiadającym <code>rustdeskId</code>.</p>
      <p style="background:#f3f4f6;padding:10px;border-radius:6px;font-family:monospace;font-size:12px">${sample}</p>
      <p style="margin:18px 0">
        <a href="https://infradesk.pl/devices" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Przypisz w panelu</a>
      </p>
      <p style="color:#9ca3af;font-size:12px">Następny tick syncu (co 10 min) rozpozna nowe powiązania.</p>
    </div>`;

  await Promise.all(admins.map((u) => sendMail({ to: u.email, subject, text, html })));
  state.unmatchedAlertSentAt = new Date().toISOString();
  writeState(state);
  logger.warn({ count, admins: admins.length }, '[rustdesk-health] unmatched alert sent');
}

async function tick(): Promise<void> {
  const state = readState();
  if (!state) {
    logger.info('[rustdesk-health] no state file yet — skip');
    return;
  }

  // 1) Stale check
  if (state.lastSyncAt) {
    const minutesAgo = Math.floor((Date.now() - new Date(state.lastSyncAt).getTime()) / 60_000);
    if (minutesAgo > STALE_AFTER_MIN) {
      await alertStale(state, minutesAgo);
    }
  } else if (state.lastError) {
    await alertStale(state, 999);
  }

  // 2) Unmatched check
  if ((state.unmatchedCount ?? 0) >= UNMATCHED_THRESHOLD) {
    await alertUnmatched(state, state.unmatchedCount!);
  }
}

export function startRustdeskHealthScheduler(): void {
  if (handle) return;
  logger.info('[rustdesk-health] scheduler started — interval 30min');
  handle = setTimeout(async function loop() {
    try { await tick(); }
    catch (err) { logger.warn({ err }, '[rustdesk-health] tick error'); }
    finally { handle = setTimeout(loop, TICK_INTERVAL_MS); }
  }, FIRST_TICK_DELAY_MS);
}

export function stopRustdeskHealthScheduler(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[rustdesk-health] scheduler stopped');
  }
}
