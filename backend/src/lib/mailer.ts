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
  });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
  });
}
