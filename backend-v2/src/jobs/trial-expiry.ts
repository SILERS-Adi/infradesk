// Auto-downgrade wygasłych 30-dniowych trial'i PRO → START.
// Działa jako self-rescheduling setTimeout — bez BullMQ (KISS dla obecnej skali).
//
// Cykl: pierwszy tick 60s po starcie procesu, potem co 1h.
// Każdy tick:
//  1. Wyszukaj workspace'y gdzie plan='PRO' AND trialEndsAt < NOW() AND deletedAt IS NULL
//  2. Dla każdego: UPDATE plan='START', trialEndsAt=NULL, planStartedAt=NOW()
//  3. Wpis w ActivityLog (kto: SYSTEM)
//  4. Wyślij email do ownera workspace'a (best effort)

import { prismaBg } from '../lib/prisma-bg';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';

const TICK_INTERVAL_MS = 60 * 60_000; // co 1h
const FIRST_TICK_DELAY_MS = 60_000;   // 60s od startu
let handle: NodeJS.Timeout | null = null;

interface ExpiredTrial {
  id: string;
  name: string;
  slug: string;
  trialEndsAt: Date | null;
}

async function findExpiredTrials(): Promise<ExpiredTrial[]> {
  return prismaBg.workspace.findMany({
    where: {
      plan: 'PRO',
      trialEndsAt: { not: null, lt: new Date() },
      deletedAt: null,
    },
    select: { id: true, name: true, slug: true, trialEndsAt: true },
    take: 100, // safety limit per tick
  });
}

interface ExpiredPaid {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planExpiresAt: Date | null;
}

// Workspace'y które OPŁACIŁY plan (TEAM/PRO/ENTERPRISE), termin minął i nie odnowiły.
// Po wygaśnięciu schodzą na START — tak jak obiecujemy w mailu reminderowym.
async function findExpiredPaidPlans(): Promise<ExpiredPaid[]> {
  return prismaBg.workspace.findMany({
    where: {
      plan: { in: ['TEAM', 'PRO', 'ENTERPRISE'] },
      trialEndsAt: null,                 // wykluczyć trialowe (te łapie findExpiredTrials)
      planExpiresAt: { not: null, lt: new Date() },
      deletedAt: null,
    },
    select: { id: true, name: true, slug: true, plan: true, planExpiresAt: true },
    take: 100,
  });
}

// D7 — gdy plan workspace spada do START, wszystkie moduły wymagające wyższego
// planu muszą zostać wyłączone w `WorkspaceModule.enabled`. Bez tego frontend
// (który czyta enabled jako toggle widoczności w menu) dalej pokazuje moduły
// PRO/TEAM/ENT — co backend od P1.1 odrzuca z 403 plan_upgrade_required.
async function resetModulesForDowngrade(workspaceId: string): Promise<number> {
  const result = await prismaBg.workspaceModule.updateMany({
    where: { workspaceId, requiredPlan: { not: 'START' } },
    data: { enabled: false },
  });
  return result.count;
}

async function downgradeOne(ws: ExpiredTrial): Promise<void> {
  await prismaBg.workspace.update({
    where: { id: ws.id },
    data: {
      plan: 'START',
      trialEndsAt: null,
      planStartedAt: new Date(),
    },
  });

  const disabledModules = await resetModulesForDowngrade(ws.id);
  if (disabledModules > 0) {
    logger.info({ workspaceId: ws.id, count: disabledModules }, '[trial-expiry] disabled modules above START plan');
  }

  await prismaBg.activityLog.create({
    data: {
      workspaceId: ws.id,
      entityType: 'workspace',
      entityId: ws.id,
      actionType: 'plan_auto_downgraded',
      description: `Trial PRO wygasł — automatyczny downgrade na plan Start.`,
      performedByUserId: null,
      metadata: {
        from: 'PRO',
        to: 'START',
        trialEndedAt: ws.trialEndsAt?.toISOString() ?? null,
      },
    },
  }).catch((err: unknown) => {
    logger.warn({ err, workspaceId: ws.id }, '[trial-expiry] activity log write failed');
  });

  // Best-effort email do ownera
  try {
    const ownerMembership = await prismaBg.membership.findFirst({
      where: { workspaceId: ws.id, role: 'OWNER', status: 'ACTIVE' },
      select: {
        user: { select: { email: true, firstName: true } },
      },
    });
    if (ownerMembership?.user?.email) {
      const greeting = ownerMembership.user.firstName
        ? `Cześć ${ownerMembership.user.firstName},`
        : 'Cześć,';
      const text = `${greeting}\n\n30-dniowy okres próbny planu PRO dla workspace "${ws.name}" właśnie się zakończył.\n\nKonto zostało automatycznie przeniesione na plan Start (49 zł/mc netto). Wszystkie Twoje dane są bezpieczne — niektóre moduły wymagają wyższego planu i tymczasowo się ukryły.\n\nChcesz wrócić do PRO? Wejdź w panel:\nhttps://infradesk.pl/plan-and-modules\n\n— InfraDesk`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h2 style="font-size:20px;margin:0 0 16px">Trial PRO się skończył</h2>
          <p>${greeting}</p>
          <p>30-dniowy okres próbny planu <strong>PRO</strong> dla workspace <strong>${ws.name}</strong> właśnie się zakończył.</p>
          <p>Konto zostało automatycznie przeniesione na plan <strong>Start</strong> (49 zł/mc netto). Wszystkie Twoje dane są bezpieczne — niektóre moduły wymagają wyższego planu i tymczasowo się ukryły.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="https://infradesk.pl/plan-and-modules" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Wybierz plan</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">Pytania? Odpisz na ten email.</p>
        </div>
      `;
      await sendMail({
        to: ownerMembership.user.email,
        subject: `Trial PRO zakończony — workspace "${ws.name}" przeniesiony na Start`,
        text,
        html,
      });
    }
  } catch (err) {
    logger.warn({ err, workspaceId: ws.id }, '[trial-expiry] owner email failed (non-fatal)');
  }
}

async function downgradePaidOne(ws: ExpiredPaid): Promise<void> {
  await prismaBg.workspace.update({
    where: { id: ws.id },
    data: {
      plan: 'START',
      planExpiresAt: null,
      planStartedAt: new Date(),
    },
  });

  const disabledModules = await resetModulesForDowngrade(ws.id);
  if (disabledModules > 0) {
    logger.info({ workspaceId: ws.id, count: disabledModules }, '[trial-expiry] disabled modules above START plan');
  }

  await prismaBg.activityLog.create({
    data: {
      workspaceId: ws.id,
      entityType: 'workspace',
      entityId: ws.id,
      actionType: 'plan_auto_downgraded',
      description: `Plan ${ws.plan} wygasł (brak odnowienia) — automatyczny downgrade na Start.`,
      performedByUserId: null,
      metadata: {
        from: ws.plan,
        to: 'START',
        planExpiredAt: ws.planExpiresAt?.toISOString() ?? null,
        reason: 'plan_not_renewed',
      },
    },
  }).catch((err: unknown) => {
    logger.warn({ err, workspaceId: ws.id }, '[trial-expiry] activity log write failed (paid)');
  });

  // Best-effort email do ownera (active only, żeby nie spamować zwolnionych)
  try {
    const ownerMembership = await prismaBg.membership.findFirst({
      where: { workspaceId: ws.id, role: 'OWNER', status: 'ACTIVE' },
      select: {
        user: { select: { email: true, firstName: true, isActive: true, deletedAt: true } },
      },
    });
    const u = ownerMembership?.user;
    if (u?.email && u.isActive && !u.deletedAt) {
      const greeting = u.firstName ? `Cześć ${u.firstName},` : 'Cześć,';
      const text = `${greeting}\n\nPlan ${ws.plan} dla workspace "${ws.name}" wygasł (nie odnowiono w terminie).\n\nKonto zostało automatycznie przeniesione na plan Start (49 zł/mc netto). Wszystkie dane są bezpieczne — niektóre moduły wymagają wyższego planu i tymczasowo się ukryły.\n\nKupić ponownie ${ws.plan}?\nhttps://infradesk.pl/plan-and-modules\n\n— InfraDesk`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h2 style="font-size:20px;margin:0 0 16px">Plan ${ws.plan} wygasł</h2>
          <p>${greeting}</p>
          <p>Plan <strong>${ws.plan}</strong> dla workspace <strong>${ws.name}</strong> wygasł (nie odnowiono w terminie).</p>
          <p>Konto zostało automatycznie przeniesione na plan <strong>Start</strong> (49 zł/mc netto). Wszystkie dane są bezpieczne — niektóre moduły wymagają wyższego planu i tymczasowo się ukryły.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="https://infradesk.pl/plan-and-modules" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Kupić ${ws.plan}</a>
          </p>
        </div>`;
      await sendMail({
        to: u.email,
        subject: `Plan ${ws.plan} wygasł — workspace "${ws.name}" przeniesiony na Start`,
        text, html,
      });
    }
  } catch (err) {
    logger.warn({ err, workspaceId: ws.id }, '[trial-expiry] paid downgrade email failed (non-fatal)');
  }
}

export async function runTrialExpirySweep(): Promise<{ found: number; downgraded: number; paidFound: number; paidDowngraded: number }> {
  const expired = await findExpiredTrials();
  let downgraded = 0;
  for (const ws of expired) {
    try {
      await downgradeOne(ws);
      downgraded++;
      logger.info({ workspaceId: ws.id, slug: ws.slug }, '[trial-expiry] downgraded PRO trial → START');
    } catch (err) {
      logger.error({ err, workspaceId: ws.id }, '[trial-expiry] trial downgrade failed');
    }
  }

  const paid = await findExpiredPaidPlans();
  let paidDowngraded = 0;
  for (const ws of paid) {
    try {
      await downgradePaidOne(ws);
      paidDowngraded++;
      logger.info({ workspaceId: ws.id, slug: ws.slug, from: ws.plan }, '[trial-expiry] downgraded paid → START');
    } catch (err) {
      logger.error({ err, workspaceId: ws.id }, '[trial-expiry] paid downgrade failed');
    }
  }

  return { found: expired.length, downgraded, paidFound: paid.length, paidDowngraded };
}

export function startTrialExpiryScheduler(): void {
  if (handle) return;
  logger.info('[trial-expiry] scheduler started — interval 60min');
  handle = setTimeout(async function tick() {
    try {
      const result = await runTrialExpirySweep();
      if (result.found > 0 || result.paidFound > 0) {
        logger.info(result, '[trial-expiry] sweep complete');
      }
    } catch (err) {
      logger.warn({ err }, '[trial-expiry] sweep error');
    } finally {
      handle = setTimeout(tick, TICK_INTERVAL_MS);
    }
  }, FIRST_TICK_DELAY_MS);
}

export function stopTrialExpiryScheduler(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
    logger.info('[trial-expiry] scheduler stopped');
  }
}
