import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const faq = [
  {
    q: "Aplikacja Android auto",
    a: "TV Dashboard (/tv):\n- Pełnoekranowy ciemny panel z 6 dużymi liczbami\n- Dwie kolumny zgłoszeń: Oczekujące | W realizacji\n- Zegar cyfrowy z datą, auto-odświeżanie co 30 sekund\n\nAndroid TV:\n- Projekt do otwarcia w Android Studio\n- Sesja logowania zachowana między uruchomieniami",
    visibility: "panel"
  },
  {
    q: "Jak zdalnie włączyć wyłączony komputer (Wake on LAN)?",
    a: "Wymagania:\n- Komputer podłączony kablem Ethernet (NIE Wi-Fi)\n- Włączony Wake on LAN w BIOS i w Windows\n\nKROK 1 — BIOS/UEFI\n1. Wejdź do BIOS (Del, F2 lub F12 podczas startu)\n2. Znajdź: Power Management lub APM\n3. Włącz: Wake on LAN lub Power On By PCI-E\n4. Zapisz i wyjdź (F10)\n\nKROK 2 — Windows\n1. Start → Menedżer urządzeń\n2. Karty sieciowe → PPM na karcie Ethernet → Właściwości\n3. Zakładka Zarządzanie energią:\n   ✓ Zezwalaj temu urządzeniu na wznawianie pracy komputera\n   ✓ Zezwalaj tylko magicznym pakietom na wznawianie komputera\n4. Zakładka Zaawansowane:\n   Wake on Magic Packet → Włączono\n5. Kliknij OK\n\nKROK 3 — Uruchomienie\nW aplikacji InfraDesk Agent na aktywnym komputerze\nw tej samej sieci → kliknij „Wybudź komputer"\n\nNajczęstsze problemy:\n• Komputer długo wyłączony → odłącz i podłącz zasilanie\n• Listwa z wyłącznikiem → sprawdź czy jest włączona\n• Brak odpowiedzi → sprawdź czy ustawienia BIOS i Windows zostały zapisane",
    visibility: "both"
  }
];

await prisma.setting.upsert({
  where: { key: 'faq' },
  update: { value: JSON.stringify(faq) },
  create: { key: 'faq', value: JSON.stringify(faq) }
});
console.log('FAQ updated OK');
await prisma.$disconnect();
