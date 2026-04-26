import nodemailer from 'nodemailer';
import prisma from './prisma';
import { AppError } from '../middleware/errorHandler';

async function getSmtpConfig(): Promise<{
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}> {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });

  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }

  if (!map.smtp_host || !map.smtp_port || !map.smtp_user || !map.smtp_pass || !map.smtp_from) {
    throw new AppError('SMTP nie skonfigurowany', 503);
  }

  return {
    host: map.smtp_host,
    port: parseInt(map.smtp_port, 10),
    user: map.smtp_user,
    pass: map.smtp_pass,
    from: map.smtp_from,
  };
}

/** Wrap content in branded InfraDesk email template */
export function emailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4F46E5,#6D28D9);padding:28px 32px;text-align:center;">
            <img src="https://infradesk.pl/logo.png" alt="InfraDesk" height="40" style="height:40px;display:inline-block;" />
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:36px 32px 28px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #eef0f4;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#9ca3af;line-height:1.6;">
                  InfraDesk by SILERS<br/>
                  <a href="https://infradesk.pl" style="color:#6366F1;text-decoration:none;">infradesk.pl</a> ·
                  <a href="mailto:kontakt@infradesk.pl" style="color:#6366F1;text-decoration:none;">kontakt@infradesk.pl</a>
                </td>
                <td align="right" style="font-size:11px;color:#d1d5db;">
                  &copy; ${new Date().getFullYear()} SILERS
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!-- Bottom text -->
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;">
            Ta wiadomość została wysłana automatycznie z systemu InfraDesk.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Create a styled CTA button for emails */
export function emailButton(text: string, url: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr><td align="center">
        <a href="${url}" style="display:inline-block;padding:14px 36px;background:#4F46E5;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;letter-spacing:0.01em;">
          ${text}
        </a>
      </td></tr>
    </table>`;
}

/** Helper: heading */
export function emailHeading(text: string): string {
  return `<h2 style="margin:0 0 12px;font-size:22px;color:#111827;font-weight:700;">${text}</h2>`;
}

/** Helper: paragraph */
export function emailText(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${text}</p>`;
}

/** Helper: muted text */
export function emailMuted(text: string): string {
  return `<p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">${text}</p>`;
}

/** Helper: info box */
export function emailInfoBox(text: string): string {
  return `
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${text}</p>
    </div>`;
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const cfg = await getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
  });
}

export async function sendMailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachments: { filename: string; content: Buffer | string; contentType?: string }[]
): Promise<void> {
  const cfg = await getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 60000,
  });

  await transporter.sendMail({ from: cfg.from, to, subject, html, attachments });
}
