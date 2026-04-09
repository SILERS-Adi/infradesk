/**
 * Trial Expiry Checker — runs periodically to handle expired trials.
 * - Marks expired trials as EXPIRED
 * - Sends email reminders (3 days before, 1 day before, on expiry)
 */
import prisma from '../lib/prisma';
import { sendMail, emailTemplate, emailHeading, emailText, emailButton, emailMuted } from '../lib/mailer';

export async function checkTrialExpiry(): Promise<{ expired: number; reminders: number }> {
  const now = new Date();
  let expired = 0;
  let reminders = 0;

  // 1. Find workspaces with expired trial
  const expiredWorkspaces = await prisma.workspace.findMany({
    where: {
      subscriptionStatus: 'TRIAL',
      trialEndDate: { lt: now },
      isActive: true,
    },
    select: { id: true, name: true, email: true, trialEndDate: true },
    take: 50,
  });

  for (const ws of expiredWorkspaces) {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { subscriptionStatus: 'EXPIRED' },
    });
    expired++;

    // Send expiry email
    if (ws.email) {
      try {
        await sendMail(ws.email, 'Trial InfraDesk wygasł', emailTemplate(
          emailHeading('Twój trial się zakończył') +
          emailText(`Trial dla workspace <strong>${ws.name}</strong> wygasł.`) +
          emailText('Aby kontynuować korzystanie z InfraDesk, wybierz plan:') +
          emailButton('Wybierz plan', 'https://infradesk.pl/plan-and-modules') +
          emailMuted('Twoje dane są bezpieczne i będą przechowywane przez 30 dni.')
        ));
      } catch { /* email send may fail */ }
    }
  }

  // 2. Send reminders for trials expiring in 3 days
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const soonExpiring = await prisma.workspace.findMany({
    where: {
      subscriptionStatus: 'TRIAL',
      trialEndDate: { gte: now, lte: threeDaysFromNow },
      isActive: true,
    },
    select: { id: true, name: true, email: true, trialEndDate: true },
    take: 50,
  });

  for (const ws of soonExpiring) {
    if (!ws.email || !ws.trialEndDate) continue;
    const daysLeft = Math.ceil((ws.trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // Only send on day 3 and day 1
    if (daysLeft !== 3 && daysLeft !== 1) continue;

    try {
      await sendMail(ws.email, `Trial InfraDesk kończy się za ${daysLeft} ${daysLeft === 1 ? 'dzień' : 'dni'}`, emailTemplate(
        emailHeading(`Twój trial kończy się za ${daysLeft} ${daysLeft === 1 ? 'dzień' : 'dni'}`) +
        emailText(`Trial dla workspace <strong>${ws.name}</strong> wygasa ${ws.trialEndDate.toLocaleDateString('pl-PL')}.`) +
        emailText('Wybierz plan, aby nie stracić dostępu do swoich danych:') +
        emailButton('Wybierz plan', 'https://infradesk.pl/plan-and-modules') +
        emailMuted('Po wygaśnięciu trialu dane będą przechowywane przez 30 dni.')
      ));
      reminders++;
    } catch { /* silent */ }
  }

  if (expired > 0 || reminders > 0) {
    console.log(`[Trial] Expired: ${expired}, Reminders sent: ${reminders}`);
  }

  return { expired, reminders };
}
