import prisma from '../lib/prisma';
import { sendMail } from '../lib/mailer';

/**
 * Wysyła powiadomienie email do klienta powiązanego ze zgłoszeniem.
 * Szuka użytkowników z rolą CLIENT przypisanych do clientId zgłoszenia.
 * Nie rzuca błędów — logi w konsoli.
 */
async function notifyClientUsers(ticketId: string, subject: string, message: string) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ticketNumber: true,
        title: true,
        clientId: true,
        client: { select: { name: true, email: true } },
      },
    });
    if (!ticket) return;

    // Szukaj użytkowników CLIENT przypisanych do tego klienta
    const clientUsers = await prisma.user.findMany({
      where: { clientId: ticket.clientId, role: 'CLIENT', isActive: true },
      select: { email: true, firstName: true },
    });

    // Dodaj email firmy jeśli istnieje
    const emails = new Set<string>();
    for (const u of clientUsers) {
      if (u.email) emails.add(u.email);
    }
    if (ticket.client?.email) emails.add(ticket.client.email);

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
            ${ticket.client?.name ?? ''} · InfraDesk
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
    console.error('notifyClientUsers error:', (err as Error).message);
  }
}

/** Powiadomienie: zgłoszenie przypisane do technika */
export function notifyTicketAssigned(ticketId: string, techName: string) {
  notifyClientUsers(
    ticketId,
    'Zgłoszenie przypisane',
    `Twoje zgłoszenie zostało przypisane do technika <strong>${techName}</strong>. Wkrótce się z Tobą skontaktujemy.`
  );
}

/** Powiadomienie: technik rozpoczął pracę */
export function notifyTicketWorkStarted(ticketId: string, techName: string) {
  notifyClientUsers(
    ticketId,
    'Rozpoczęto pracę',
    `Technik <strong>${techName}</strong> rozpoczął pracę nad Twoim zgłoszeniem.`
  );
}

/** Powiadomienie: technik zakończył pracę */
export function notifyTicketWorkCompleted(ticketId: string, techName: string) {
  notifyClientUsers(
    ticketId,
    'Praca zakończona',
    `Technik <strong>${techName}</strong> zakończył pracę nad Twoim zgłoszeniem. Jeśli problem nie został rozwiązany, skontaktuj się z nami.`
  );
}
