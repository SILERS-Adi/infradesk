import prisma from '../../lib/prisma';

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
