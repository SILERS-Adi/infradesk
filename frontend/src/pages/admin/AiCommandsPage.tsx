import { useState } from 'react';
import {
  Sparkles, Mic, Building2, Ticket, ClipboardList, ShoppingCart, Plane,
  Search, MessageSquare, ArrowRightLeft, UserCheck, Monitor, RefreshCw,
  Power, Wifi, HardDrive, Shield, Cpu, BarChart3, Camera, Terminal,
  Download, Thermometer, Globe, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Command {
  icon: React.ReactNode;
  name: string;
  description: string;
  examples: string[];
  tag?: string;
}

const PANEL_COMMANDS: { group: string; commands: Command[] }[] = [
  {
    group: 'Tworzenie rekordów',
    commands: [
      {
        icon: <Building2 className="h-4 w-4" />,
        name: 'Załóż firmę / klienta',
        description: 'Tworzenie nowego klienta w systemie z danymi: nazwa, NIP, e-mail, telefon, adres.',
        examples: [
          'Załóż firmę Kowalski IT, NIP 1234567890',
          'Dodaj klienta Jan Nowak, email jan@nowak.pl, telefon 600100200',
          'Utwórz firmę ABC Serwis',
        ],
      },
      {
        icon: <Ticket className="h-4 w-4" />,
        name: 'Utwórz zgłoszenie',
        description: 'Nowe zgłoszenie serwisowe z przypisaniem do klienta, priorytetu, typu i technika.',
        examples: [
          'Nowe zgłoszenie dla firmy ABC - nie działa drukarka',
          'Zgłoszenie krytyczne dla Kowalski IT - serwer nie odpowiada',
          'Utwórz zgłoszenie konserwacja dla firmy XYZ, przypisz do Jana',
        ],
      },
      {
        icon: <ClipboardList className="h-4 w-4" />,
        name: 'Utwórz zadanie',
        description: 'Zadanie wewnętrzne z przypisaniem do technika i terminem wykonania.',
        examples: [
          'Utwórz zadanie napraw serwer dla Jana',
          'Zadanie: aktualizacja oprogramowania, termin do piątku, dla Marka',
          'Nowe zadanie przegląd sieci dla Anny na jutro',
        ],
      },
      {
        icon: <ShoppingCart className="h-4 w-4" />,
        name: 'Utwórz zamówienie',
        description: 'Zamówienie części lub materiałów dla klienta.',
        examples: [
          'Zamów 2 tonery dla firmy XYZ',
          'Zamówienie: 3 kable sieciowe i switch dla ABC Serwis',
          'Zamów dysk SSD 1TB dla Kowalski IT',
        ],
      },
      {
        icon: <Plane className="h-4 w-4" />,
        name: 'Zaplanuj delegację',
        description: 'Wyjazd serwisowy do klienta z datą i przypisanym technikiem.',
        examples: [
          'Zaplanuj delegację do firmy ABC na jutro',
          'Delegacja do Kowalski IT w piątek, przypisz do Marka',
          'Wyjazd serwisowy do XYZ za tydzień',
        ],
      },
    ],
  },
  {
    group: 'Zarządzanie',
    commands: [
      {
        icon: <ArrowRightLeft className="h-4 w-4" />,
        name: 'Zmień status',
        description: 'Zmiana statusu zgłoszenia, zadania lub zamówienia.',
        examples: [
          'Zmień status zgłoszenia 15 na wykonane',
          'Zamknij zgłoszenie numer 42',
          'Zadanie napraw serwer oznacz jako w trakcie',
          'Anuluj zamówienie 8',
        ],
      },
      {
        icon: <UserCheck className="h-4 w-4" />,
        name: 'Przypisz zgłoszenie',
        description: 'Przypisanie zgłoszenia do konkretnego technika.',
        examples: [
          'Przypisz zgłoszenie 15 do Kowalskiego',
          'Zgłoszenie drukarka - przydziel Janowi',
        ],
      },
      {
        icon: <MessageSquare className="h-4 w-4" />,
        name: 'Dodaj komentarz',
        description: 'Dodanie komentarza (publicznego lub wewnętrznego) do zgłoszenia.',
        examples: [
          'Dodaj komentarz do zgłoszenia 15: czekam na części',
          'Notatka wewnętrzna do zgłoszenia 8: klient nie odbiera telefonu',
        ],
      },
      {
        icon: <Search className="h-4 w-4" />,
        name: 'Wyszukiwanie',
        description: 'Szybkie wyszukiwanie klientów, zgłoszeń, urządzeń i zadań.',
        examples: [
          'Znajdź klienta Kowalski',
          'Szukaj zgłoszenia drukarka',
          'Pokaż urządzenia serwer',
        ],
      },
    ],
  },
  {
    group: 'AI Sugestie',
    commands: [
      {
        icon: <Sparkles className="h-4 w-4" />,
        name: 'Sugestia rozwiązania',
        description: 'AI analizuje zgłoszenie i proponuje kroki rozwiązania, trudność i szacowany czas.',
        examples: [
          'Dostępne w szczegółach zgłoszenia / na liście zadań',
        ],
        tag: 'auto',
      },
    ],
  },
];

const AGENT_COMMANDS: { group: string; commands: Command[] }[] = [
  {
    group: 'Zarządzanie systemem',
    commands: [
      {
        icon: <Download className="h-4 w-4" />,
        name: 'Windows Update',
        description: 'Zdalne uruchomienie aktualizacji Windows na stacji roboczej. Możliwość zaplanowania restartu.',
        examples: ['Aktualizuj Windows na stacji PC-001', 'Windows Update z restartem o 22:00'],
        tag: 'ADMIN',
      },
      {
        icon: <Power className="h-4 w-4" />,
        name: 'Restart systemu',
        description: 'Zdalny restart komputera z konfigurowalnym opóźnieniem (domyślnie 60s).',
        examples: ['Uruchom ponownie PC-BIURO-3', 'Restart serwera za 5 minut'],
        tag: 'ADMIN',
      },
      {
        icon: <RefreshCw className="h-4 w-4" />,
        name: 'Restart usługi Windows',
        description: 'Zatrzymanie i ponowne uruchomienie dowolnej usługi Windows (net stop / net start).',
        examples: ['Zrestartuj usługę Spooler na PC-001', 'Restart usługi SQL Server'],
        tag: 'ADMIN',
      },
      {
        icon: <Wifi className="h-4 w-4" />,
        name: 'Wake on LAN',
        description: 'Zdalne wybudzenie komputera przez sieć lokalną (magic packet przez agenta relay).',
        examples: ['Wybudź komputer PC-MAGAZYN', 'Wake on LAN dla serwera NAS'],
        tag: 'ADMIN + TECH',
      },
    ],
  },
  {
    group: 'Monitoring i diagnostyka',
    commands: [
      {
        icon: <Cpu className="h-4 w-4" />,
        name: 'Informacje o systemie',
        description: 'Automatyczny raport: hostname, OS, domena, CPU, RAM, GPU, płyta główna, numer seryjny, czas uruchomienia.',
        examples: ['Zbierane automatycznie przy rejestracji agenta'],
        tag: 'auto',
      },
      {
        icon: <HardDrive className="h-4 w-4" />,
        name: 'Dyski i partycje',
        description: 'Lista partycji z pojemnością, wolnym miejscem i procentem użycia.',
        examples: ['Automatyczne raportowanie'],
        tag: 'auto',
      },
      {
        icon: <Globe className="h-4 w-4" />,
        name: 'Interfejsy sieciowe',
        description: 'Lista interfejsów: nazwa, IP, MAC, status połączenia.',
        examples: ['Automatyczne raportowanie'],
        tag: 'auto',
      },
      {
        icon: <BarChart3 className="h-4 w-4" />,
        name: 'Metryki wydajności',
        description: 'Okresowy pomiar CPU, RAM, dysków - wysyłany co kilka minut.',
        examples: ['CPU: 45%, RAM: 8.2/16 GB, Dysk C: 78%'],
        tag: 'auto',
      },
      {
        icon: <Thermometer className="h-4 w-4" />,
        name: 'Temperatura CPU',
        description: 'Odczyt temperatury procesora przez WMI.',
        examples: ['CPU: 62°C'],
        tag: 'auto',
      },
      {
        icon: <Monitor className="h-4 w-4" />,
        name: 'Zainstalowane oprogramowanie',
        description: 'Pełna lista zainstalowanego oprogramowania z wersją i wydawcą.',
        examples: ['Automatyczny audyt przy rejestracji i periodycznie'],
        tag: 'auto',
      },
      {
        icon: <Shield className="h-4 w-4" />,
        name: 'Auto-diagnostyka',
        description: 'Automatyczne sprawdzanie stanu systemu co 5 minut.',
        examples: ['Uruchamiane w tle przez agenta'],
        tag: 'auto',
      },
    ],
  },
  {
    group: 'Zdalny dostęp i backup',
    commands: [
      {
        icon: <Terminal className="h-4 w-4" />,
        name: 'RustDesk / AnyDesk / TeamViewer',
        description: 'Automatyczne wykrywanie ID zdalnego dostępu. Możliwość pobrania hasła RustDesk.',
        examples: ['Pokaż ID RustDesk dla PC-001'],
        tag: 'ADMIN + TECH',
      },
      {
        icon: <Camera className="h-4 w-4" />,
        name: 'Zrzut ekranu',
        description: 'Zdalne pobranie zrzutu ekranu ze stacji roboczej.',
        examples: ['Screenshot PC-BIURO-5'],
        tag: 'ADMIN',
      },
      {
        icon: <HardDrive className="h-4 w-4" />,
        name: 'Backup',
        description: 'Uruchomienie kopii zapasowej (baza danych lub folder) wg konfiguracji.',
        examples: ['Uruchom backup konfiguracji ID 3'],
        tag: 'ADMIN',
      },
    ],
  },
  {
    group: 'Zarządzanie agentem',
    commands: [
      {
        icon: <Download className="h-4 w-4" />,
        name: 'Auto-aktualizacja agenta',
        description: 'Zdalne wysłanie nowej wersji agenta na stację roboczą.',
        examples: ['Aktualizuj agenta na PC-001'],
        tag: 'ADMIN',
      },
    ],
  },
];

function CommandCard({ cmd }: { cmd: Command }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ai-cmd-card" onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="ai-cmd-icon">{cmd.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tf)' }}>{cmd.name}</span>
            {cmd.tag && (
              <span className={`ai-cmd-tag ${cmd.tag === 'auto' ? 'auto' : cmd.tag === 'ADMIN' ? 'admin' : 'tech'}`}>
                {cmd.tag === 'auto' ? 'Automatyczne' : cmd.tag}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--td)', margin: '2px 0 0', lineHeight: 1.4 }}>{cmd.description}</p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'var(--td)', flexShrink: 0 }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--td)', flexShrink: 0 }} />}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 34 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Przykłady
          </p>
          {cmd.examples.map((ex, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
              <Mic className="h-3 w-3" style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--tm)', fontStyle: 'italic' }}>"{ex}"</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AiCommandsPage() {
  const [tab, setTab] = useState<'panel' | 'agent'>('panel');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tf)', margin: 0 }}>
              Asystent AI — Polecenia
            </h1>
            <p style={{ fontSize: 12, color: 'var(--td)', margin: 0 }}>
              Lista wszystkich poleceń głosowych i możliwości systemu
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ai-tabs">
        <button
          onClick={() => setTab('panel')}
          className={`ai-tab ${tab === 'panel' ? 'active' : ''}`}
        >
          <Sparkles className="h-4 w-4" />
          Panel InfraDesk
          <span className="ai-tab-count">{PANEL_COMMANDS.reduce((n, g) => n + g.commands.length, 0)}</span>
        </button>
        <button
          onClick={() => setTab('agent')}
          className={`ai-tab ${tab === 'agent' ? 'active' : ''}`}
        >
          <Monitor className="h-4 w-4" />
          Asystent (Agent)
          <span className="ai-tab-count">{AGENT_COMMANDS.reduce((n, g) => n + g.commands.length, 0)}</span>
        </button>
      </div>

      {/* Content */}
      {tab === 'panel' && (
        <div>
          <div className="ai-info-box" style={{ marginBottom: 16 }}>
            <Mic className="h-4 w-4" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--tf)', margin: 0 }}>Sterowanie głosowe panelu</p>
              <p style={{ fontSize: 11, color: 'var(--td)', margin: '2px 0 0', lineHeight: 1.4 }}>
                Kliknij przycisk <strong>Sparkles</strong> w prawym dolnym rogu panelu, naciśnij mikrofon i wydaj polecenie po polsku.
                System rozpozna mowę, przetworzy przez AI i automatycznie wykona akcję.
              </p>
            </div>
          </div>

          {PANEL_COMMANDS.map(group => (
            <div key={group.group} style={{ marginBottom: 20 }}>
              <h3 className="ai-group-title">{group.group}</h3>
              <div className="ai-cmd-grid">
                {group.commands.map(cmd => <CommandCard key={cmd.name} cmd={cmd} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'agent' && (
        <div>
          <div className="ai-info-box" style={{ marginBottom: 16 }}>
            <Monitor className="h-4 w-4" style={{ color: '#4ADE80', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--tf)', margin: 0 }}>Agent desktopowy</p>
              <p style={{ fontSize: 11, color: 'var(--td)', margin: '2px 0 0', lineHeight: 1.4 }}>
                Agent InfraDesk działa jako usługa Windows na stacjach roboczych. Zbiera dane o systemie,
                wykonuje polecenia zdalne i monitoruje wydajność. Wymaga zatwierdzenia w <strong>Poczekalnia agentów</strong>.
              </p>
            </div>
          </div>

          <div className="ai-info-box warn" style={{ marginBottom: 16 }}>
            <Shield className="h-4 w-4" style={{ color: '#FBBF24', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 11, color: 'var(--td)', margin: 0, lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--tf)' }}>Uprawnienia:</strong>{' '}
                <span className="ai-cmd-tag admin">ADMIN</span> — tylko administrator,{' '}
                <span className="ai-cmd-tag tech">ADMIN + TECH</span> — administrator i technik,{' '}
                <span className="ai-cmd-tag auto">Automatyczne</span> — agent wykonuje samodzielnie.
              </p>
            </div>
          </div>

          {AGENT_COMMANDS.map(group => (
            <div key={group.group} style={{ marginBottom: 20 }}>
              <h3 className="ai-group-title">{group.group}</h3>
              <div className="ai-cmd-grid">
                {group.commands.map(cmd => <CommandCard key={cmd.name} cmd={cmd} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
