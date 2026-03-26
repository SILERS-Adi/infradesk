import prisma from '../../lib/prisma';
import { sendMail } from '../../lib/mailer';

const DEFAULT_CONTACT = JSON.stringify({
  infolinia: '+48 575 662 664',
  email: 'zgloszenia@silers.pl',
  opiekun: 'Adrian Błaszczykowski',
  opiekunTel: '+48 604 292 831',
  opiekunEmail: 'adrian@silers.pl',
});

const DEFAULT_FAQ = JSON.stringify([
  {
    q: 'Jak zdalnie uruchomić wyłączony komputer?',
    a: 'Komputer musi być podłączony kablem Ethernet (nie WiFi), mieć włączony Wake on LAN w BIOS/UEFI oraz w Menedżerze urządzeń Windows (Właściwości karty sieciowej → Zarządzanie energią). Funkcja działa tylko jeśli na tej samej sieci jest przynajmniej jeden inny aktywny agent InfraDesk.',
  },
  {
    q: 'Co zrobić gdy agent nie łączy się z serwerem?',
    a: 'Sprawdź połączenie internetowe. Upewnij się że program działa (ikona w zasobniku systemowym). Jeśli ikona jest szara — kliknij PPM i wybierz "Zamknij", a następnie uruchom program ponownie ze skrótu na pulpicie.',
  },
  {
    q: 'Jak wysłać zgłoszenie serwisowe?',
    a: 'Kliknij dwukrotnie skrót "Zgłoszenie serwisowe" na pulpicie lub kliknij PPM na ikonie InfraDesk w zasobniku systemowym i wybierz "Nowe zgłoszenie".',
  },
]);

export async function initDefaultSettings(): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'contact' },
    update: {},
    create: { key: 'contact', value: DEFAULT_CONTACT },
  });
  await prisma.setting.upsert({
    where: { key: 'faq' },
    update: {},
    create: { key: 'faq', value: DEFAULT_FAQ },
  });
}

export async function getSetting(key: string): Promise<{ key: string; value: string } | null> {
  return prisma.setting.findUnique({ where: { key } });
}

export async function setSetting(key: string, value: string): Promise<{ key: string; value: string }> {
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getContactInfo(): Promise<Record<string, string>> {
  const setting = await prisma.setting.findUnique({ where: { key: 'contact' } });
  if (!setting) return JSON.parse(DEFAULT_CONTACT);
  try { return JSON.parse(setting.value); }
  catch { return JSON.parse(DEFAULT_CONTACT); }
}

// ── SMTP settings ──────────────────────────────────────────────────────────────

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] as const;

export async function getSmtpSettings(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...SMTP_KEYS] } },
  });
  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }
  return result;
}

export async function saveSmtpSettings(data: {
  smtp_host?: string;
  smtp_port?: string | number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
}): Promise<Record<string, string>> {
  const entries: [string, string][] = [];
  if (data.smtp_host !== undefined) entries.push(['smtp_host', String(data.smtp_host)]);
  if (data.smtp_port !== undefined) entries.push(['smtp_port', String(data.smtp_port)]);
  if (data.smtp_user !== undefined) entries.push(['smtp_user', String(data.smtp_user)]);
  if (data.smtp_pass !== undefined) entries.push(['smtp_pass', String(data.smtp_pass)]);
  if (data.smtp_from !== undefined) entries.push(['smtp_from', String(data.smtp_from)]);

  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return getSmtpSettings();
}

export async function testSmtp(email: string): Promise<void> {
  await sendMail(
    email,
    'InfraDesk — test konfiguracji SMTP',
    '<p>Ta wiadomość potwierdza poprawność konfiguracji SMTP w systemie InfraDesk.</p>'
  );
}

export async function getFaqItems(forAgent = false): Promise<Array<{ q: string; a: string; visibility?: string }>> {
  const setting = await prisma.setting.findUnique({ where: { key: 'faq' } });
  const all: Array<{ q: string; a: string; visibility?: string }> = (() => {
    try { return JSON.parse(setting?.value ?? ''); }
    catch { return JSON.parse(DEFAULT_FAQ); }
  })();
  if (forAgent) {
    return all.filter(it => !it.visibility || it.visibility === 'agent' || it.visibility === 'both');
  }
  return all;
}
