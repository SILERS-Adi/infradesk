/**
 * lib/mailer.ts — transactional email service.
 *
 * Used for: verification, password reset, client invite.
 * SMTP creds via env: SMTP_HOST/PORT/USER/PASS/FROM/FROM_NAME, APP_URL.
 * Bulk and marketing email is out of scope (use a separate provider).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from './logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = (process.env.SMTP_SECURE ?? 'true') === 'true';
  if (!host || !user || !pass) {
    logger.warn('[mailer] SMTP not configured — emails will be skipped');
    return null;
  }
  transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });
  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendMail(opts: SendMailOptions): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: 'SMTP not configured' };
  const fromAddr = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@localhost';
  const fromName = process.env.SMTP_FROM_NAME ?? 'InfraDesk';
  try {
    const info = await t.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    logger.info({ to: opts.to, subject: opts.subject, messageId: info.messageId }, '[mailer] sent');
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ err, to: opts.to, subject: opts.subject }, '[mailer] send failed');
    return { ok: false, error: (err as Error).message };
  }
}

// ── Templates ───────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL ?? 'https://infradesk.pl';

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;line-height:1.6">
<div style="max-width:560px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.05)">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;color:#fff">
    <h1 style="margin:0;font-size:20px">InfraDesk</h1>
  </div>
  <div style="padding:28px 24px;font-size:14px">
    ${body}
  </div>
  <div style="padding:18px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb">
    InfraDesk · <a href="${APP_URL}" style="color:#6366f1;text-decoration:none">${APP_URL.replace(/^https?:\/\//, '')}</a>
  </div>
</div></body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function sendVerificationEmail(email: string, token: string, firstName?: string | null): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = firstName ? `Cześć ${escape(firstName)},` : 'Cześć,';
  const text = `${greeting}\n\nKliknij poniższy link aby zweryfikować swój adres email:\n${link}\n\nLink wygasa w ciągu 24 godzin.\n\n— InfraDesk`;
  const html = htmlShell('Potwierdź email', `
    <p>${greeting}</p>
    <p>Kliknij przycisk aby zweryfikować swój adres email i aktywować konto:</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Potwierdź email</a></p>
    <p style="color:#6b7280;font-size:12px">Lub wklej w przeglądarkę: <br><span style="word-break:break-all">${escape(link)}</span></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Link wygasa w ciągu 24 godzin. Jeśli to nie Ty założyłeś konto — zignoruj tę wiadomość.</p>
  `);
  await sendMail({ to: email, subject: 'Potwierdź email — InfraDesk', text, html });
}

export async function sendPasswordResetEmail(email: string, token: string, firstName?: string | null): Promise<void> {
  const link = `${APP_URL}/password-reset?token=${encodeURIComponent(token)}`;
  const greeting = firstName ? `Cześć ${escape(firstName)},` : 'Cześć,';
  const text = `${greeting}\n\nKliknij link aby ustawić nowe hasło:\n${link}\n\nLink wygasa w ciągu 1 godziny. Jeśli to nie Ty zlecił reset — zignoruj tę wiadomość.\n\n— InfraDesk`;
  const html = htmlShell('Reset hasła', `
    <p>${greeting}</p>
    <p>Otrzymaliśmy prośbę o reset hasła do Twojego konta.</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Ustaw nowe hasło</a></p>
    <p style="color:#6b7280;font-size:12px">Lub wklej w przeglądarkę:<br><span style="word-break:break-all">${escape(link)}</span></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Link wygasa w ciągu 1 godziny. Jeśli to nie Ty zlecił reset — zignoruj tę wiadomość, hasło nie zostanie zmienione.</p>
  `);
  await sendMail({ to: email, subject: 'Reset hasła — InfraDesk', text, html });
}

export async function sendClientInviteEmail(
  email: string,
  token: string,
  workspaceName: string,
  invitedByName?: string | null,
): Promise<void> {
  const link = `${APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  const inviter = invitedByName ? escape(invitedByName) : 'Twój opiekun IT';
  const wsName = escape(workspaceName);
  const text = `Cześć,\n\n${inviter} (${wsName}) zaprasza Cię do panelu InfraDesk gdzie możesz zarządzać zgłoszeniami serwisowymi i zasobami IT swojej firmy.\n\nKliknij link aby utworzyć konto:\n${link}\n\nLink jest jednorazowy i wygasa w ciągu 7 dni.\n\n— InfraDesk`;
  const html = htmlShell('Zaproszenie do InfraDesk', `
    <p>Cześć,</p>
    <p><strong>${inviter}</strong> z firmy <strong>${wsName}</strong> zaprasza Cię do panelu InfraDesk.</p>
    <p>W panelu zobaczysz aktywne zgłoszenia serwisowe, urządzenia, kopie zapasowe i pliki udostępnione przez Twojego opiekuna IT.</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Akceptuję zaproszenie</a></p>
    <p style="color:#6b7280;font-size:12px">Lub wklej w przeglądarkę:<br><span style="word-break:break-all">${escape(link)}</span></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Link jest jednorazowy i wygasa w ciągu 7 dni.</p>
  `);
  await sendMail({ to: email, subject: `Zaproszenie do panelu InfraDesk — ${workspaceName}`, text, html });
}
