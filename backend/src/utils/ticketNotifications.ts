import prisma from '../lib/prisma';
import { sendMail } from '../lib/mailer';

/**
 * Wysyła powiadomienie email do użytkowników workspace powiązanego ze zgłoszeniem.
 * Nie rzuca błędów — logi w konsoli.
 */
async function notifyWorkspaceUsers(ticketId: string, subject: string, message: string) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticketNumber: true,
        title: true,
        workspaceId: true,
        workspace: { select: { name: true, email: true } },
      },
    });
    if (!ticket) return;

    // Collect emails from workspace
    const emails = new Set<string>();
    if (ticket.workspace?.email) emails.add(ticket.workspace.email);

    if (emails.size === 0) return;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a, #1e40af); padding: 24px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">InfraDesk</h2>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #64748b; font-size: 13px; margin: 0 0 4px;">Zgłoszenie ${ticket.ticketNumber}</p>
          <h3 style="color: #0f172a; margin: 0 0 16px; font-size: 16px;">${ticket.title}</h3>
          <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">${message}</p>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            ${ticket.workspace?.name ?? ''} · InfraDesk
          </p>
        </div>
      </div>
    `;

    for (const email of emails) {
      sendMail(email, `[${ticket.ticketNumber}] ${subject}`, html).catch(err => {
        console.error(`Ticket notification email failed for ${email}:`, err.message);
      });
    }
  } catch (err) {
    console.error('notifyWorkspaceUsers error:', (err as Error).message);
  }
}

/** Powiadomienie: zgłoszenie przypisane do technika */
export function notifyTicketAssigned(ticketId: string, techName: string) {
  notifyWorkspaceUsers(
    ticketId,
    'Zgłoszenie przypisane',
    `Twoje zgłoszenie zostało przypisane do technika <strong>${techName}</strong>. Wkrótce się z Tobą skontaktujemy.`
  );
}

/** Powiadomienie: technik rozpoczął pracę */
export function notifyTicketWorkStarted(ticketId: string, techName: string) {
  notifyWorkspaceUsers(
    ticketId,
    'Rozpoczęto pracę',
    `Technik <strong>${techName}</strong> rozpoczął pracę nad Twoim zgłoszeniem.`
  );
}

/** Powiadomienie: technik zakończył pracę */
export function notifyTicketWorkCompleted(ticketId: string, techName: string) {
  notifyWorkspaceUsers(
    ticketId,
    'Praca zakończona',
    `Technik <strong>${techName}</strong> zakończył pracę nad Twoim zgłoszeniem. Jeśli problem nie został rozwiązany, skontaktuj się z nami.`
  );
}
