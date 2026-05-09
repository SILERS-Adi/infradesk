// Renewal reminder — co 12h sprawdza workspace'y których planExpiresAt
// jest za 14 dni i nie wysłał jeszcze przypomnienia. Email do owner'a.
//
// Idempotent: zapisuje `lastRenewalReminderAt` w workspace (osobna kolumna nie
// jest potrzebna — używamy ActivityLog z actionType='renewal_reminder_sent'
// jako marker żeby nie spamować).

import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';

const TICK_INTERVAL_MS = 12 * 60 * 60_000; // co 12h
const FIRST_TICK_DELAY_MS = 10 * 60_000;   // 10 min od startu (po innych schedulerach)
const REMIND_DAYS_BEFORE = 14;

let handle: NodeJS.Timeout | null = null;

interface ExpiringWorkspace {
  id: string;
  name: string;
  plan: string;
  planExpiresAt: Date | null;
}

async function findExpiringWorkspaces(): Promise<ExpiringWorkspace[]> {
  const now = new Date();
  const reminderWindow = new Date(now.getTime() + REMIND_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  return prismaBg.workspace.findMany({
    where: {
      planExpiresAt: { gt: now, lt: reminderWindow },
      deletedAt: null,
      // START po opłaceniu (49 zł/mc) też ma planExpiresAt — wymaga remindera.
      // Workspaces na trialu (trialEndsAt != null) NIE mają planExpiresAt → out of scope.
      plan: { in: ['START', 'TEAM', 'PRO', 'ENTERPRISE'] },
    },
    select: { id: true, name: true, plan: true, planExpiresAt: true },
    take: 100,
  });
}

async function alreadyReminded(workspaceId: string, expiryDate: Date): Promise<boolean> {
  // Sprawdzamy czy w tym cyklu rozliczeniowym (od ostatniego planStartedAt) wysłaliśmy reminder
  const since = new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 dni przed expiry
  const found = await prismaBg.activityLog.findFirst({
    where: {
      workspaceId,
      actionType: 'renewal_reminder_sent',
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return found != null;
}

async function remindOne(ws: ExpiringWorkspace): Promise<void> {
  if (!ws.planExpiresAt) return;
  if (await alreadyReminded(ws.id, ws.planExpiresAt)) return;

  const owner = await prismaBg.membership.findFirst({
    where: { workspaceId: ws.id, role: 'OWNER', status: 'ACTIVE' },
    select: { user: { select: { email: true, firstName: true, isActive: true } } },
  });
  const email = owner?.user?.email;
  if (!email || owner.user.isActive === false) return;

  const daysLeft = Math.ceil((ws.planExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const expiryDate = ws.planExpiresAt.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const greeting = owner.user.firstName ? `Cześć ${owner.user.firstName},` : 'Cześć,';

  const subject = `Plan ${ws.plan} dla "${ws.name}" wygasa za ${daysLeft} dni`;
  const text =
    `${greeting}\n\nPlan ${ws.plan} dla workspace "${ws.name}" wygasa ${expiryDate} (za ${daysLeft} dni).\n\n` +
    `Jeśli chcesz kontynuować, opłać przedłużenie w panelu:\n` +
    `https://infradesk.pl/plan-and-modules\n\n` +
    `Jeśli nic nie zrobisz, plan po wygaśnięciu zejdzie na Start (49 zł/mc) — wszystkie dane pozostaną, ` +
    `ale niektóre moduły wymagają wyższego planu.\n\n— InfraDesk`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="font-size:20px;margin:0 0 16px">Plan wygasa za ${daysLeft} dni</h2>
      <p>${greeting}</p>
      <p>Plan <strong>${ws.plan}</strong> dla workspace <strong>${ws.name}</strong> wygasa
        <strong>${expiryDate}</strong>.</p>
      <p>Aby przedłużyć — wejdź do panelu:</p>
      <p style="text-align:center;margin:28px 0">
        <a href="https://infradesk.pl/plan-and-modules"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
          Przedłuż plan
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px">
        Jeśli nic nie zrobisz, plan po wygaśnięciu zejdzie na Start (49 zł/mc).
        Dane pozostaną, ale niektóre moduły (Backupy, AI Iris, monitoring) wymagają wyższego planu.
      </p>
    </div>`;

  await sendMail({ to: email, subject, text, html });

  // Marker żeby nie spamować — wpis w ActivityLog
  await prismaBg.activityLog.create({
    data: {
      workspaceId: ws.id,
      entityType: 'workspace',
      entityId: ws.id,
      actionType: 'renewal_reminder_sent',
      description: `Renewal reminder wysłany do ${email} — plan ${ws.plan} wygasa ${expiryDate}`,
      performedByUserId: null,
      metadata: { plan: ws.plan, expiresAt: ws.planExpiresAt.toISOString(), daysLeft },
    },
  }).catch((err: unknown) => logger.warn({ err, workspaceId: ws.id }, '[renewal-reminder] activity log failed'));

  logger.info({ workspaceId: ws.id, email, daysLeft }, '[renewal-reminder] sent');
}

export async function runRenewalReminderSweep(): Promise<{ found: number; sent: number }> {
  const expiring = await findExpiringWorkspaces();
  if (expiring.length === 0) return { found: 0, sent: 0 };
  let sent = 0;
  for (const ws of expiring) {
    try {
      await remindOne(ws);
      sent++;
    } catch (err) {
      logger.warn({ err, workspaceId: ws.id }, '[renewal-reminder] one workspace failed');
    }
  }
  return { found: expiring.length, sent };
}

export function startRenewalReminderScheduler(): void {
  if (handle) return;
  logger.info('[renewal-reminder] scheduler started — interval 12h');
  handle = setTimeout(async function loop() {
    try {
      const r = await runRenewalReminderSweep();
      if (r.found > 0) logger.info(r, '[renewal-reminder] sweep complete');
    } catch (err) {
      logger.warn({ err }, '[renewal-reminder] sweep error');
    } finally {
      handle = setTimeout(loop, TICK_INTERVAL_MS);
    }
  }, FIRST_TICK_DELAY_MS);
}

export function stopRenewalReminderScheduler(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[renewal-reminder] scheduler stopped');
  }
}
