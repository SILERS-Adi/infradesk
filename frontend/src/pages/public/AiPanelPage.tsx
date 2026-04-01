import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Sparkles, Mail, Lock, ArrowRight, Loader2, LogOut,
  Mic, Building2, Ticket, ClipboardList, ShoppingCart, Plane,
  Search, MessageSquare, ArrowRightLeft, UserCheck, Monitor, RefreshCw,
  Power, Wifi, HardDrive, Shield, Cpu, BarChart3, Camera, Terminal,
  Download, Thermometer, Globe, ChevronDown, ChevronUp,
} from 'lucide-react';
import { authApi } from '../../api/auth';
import type { User } from '../../types';

/* ── Auth helpers (standalone, not using global authStore) ── */
const AI_TOKEN_KEY = 'ai_panel_token';
const AI_USER_KEY = 'ai_panel_user';

function getStoredSession(): { token: string; user: User } | null {
  const token = localStorage.getItem(AI_TOKEN_KEY);
  const userStr = localStorage.getItem(AI_USER_KEY);
  if (!token || !userStr) return null;
  try { return { token, user: JSON.parse(userStr) }; }
  catch { return null; }
}

function storeSession(token: string, refreshToken: string, user: User) {
  localStorage.setItem(AI_TOKEN_KEY, token);
  localStorage.setItem(AI_USER_KEY, JSON.stringify(user));
  // Also store in main auth keys so API calls work
  localStorage.setItem('infradesk_access_token', token);
  localStorage.setItem('infradesk_refresh_token', refreshToken);
  localStorage.setItem('infradesk_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AI_TOKEN_KEY);
  localStorage.removeItem(AI_USER_KEY);
}

/* ── Command data ── */
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
        examples: ['Załóż firmę Kowalski IT, NIP 1234567890', 'Dodaj klienta Jan Nowak, email jan@nowak.pl', 'Utwórz firmę ABC Serwis'],
      },
      {
        icon: <Ticket className="h-4 w-4" />,
        name: 'Utwórz zgłoszenie',
        description: 'Nowe zgłoszenie serwisowe z przypisaniem do klienta, priorytetu, typu i technika.',
        examples: ['Nowe zgłoszenie dla firmy ABC - nie działa drukarka', 'Zgłoszenie krytyczne - serwer nie odpowiada', 'Utwórz zgłoszenie konserwacja, przypisz do Jana'],
      },
      {
        icon: <ClipboardList className="h-4 w-4" />,
        name: 'Utwórz zadanie',
        description: 'Zadanie wewnętrzne z przypisaniem do technika i terminem wykonania.',
        examples: ['Utwórz zadanie napraw serwer dla Jana', 'Zadanie: aktualizacja oprogramowania na piątek', 'Nowe zadanie przegląd sieci dla Anny na jutro'],
      },
      {
        icon: <ShoppingCart className="h-4 w-4" />,
        name: 'Utwórz zamówienie',
        description: 'Zamówienie części lub materiałów dla klienta.',
        examples: ['Zamów 2 tonery dla firmy XYZ', 'Zamówienie: 3 kable sieciowe i switch', 'Zamów dysk SSD 1TB dla Kowalski IT'],
      },
      {
        icon: <Plane className="h-4 w-4" />,
        name: 'Zaplanuj delegację',
        description: 'Wyjazd serwisowy do klienta z datą i przypisanym technikiem.',
        examples: ['Zaplanuj delegację do firmy ABC na jutro', 'Delegacja do Kowalski IT w piątek', 'Wyjazd serwisowy do XYZ za tydzień'],
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
        examples: ['Zmień status zgłoszenia 15 na wykonane', 'Zamknij zgłoszenie numer 42', 'Zadanie napraw serwer oznacz jako w trakcie'],
      },
      {
        icon: <UserCheck className="h-4 w-4" />,
        name: 'Przypisz zgłoszenie',
        description: 'Przypisanie zgłoszenia do konkretnego technika.',
        examples: ['Przypisz zgłoszenie 15 do Kowalskiego', 'Zgłoszenie drukarka - przydziel Janowi'],
      },
      {
        icon: <MessageSquare className="h-4 w-4" />,
        name: 'Dodaj komentarz',
        description: 'Dodanie komentarza do zgłoszenia.',
        examples: ['Dodaj komentarz do zgłoszenia 15: czekam na części', 'Notatka wewnętrzna do zgłoszenia 8'],
      },
      {
        icon: <Search className="h-4 w-4" />,
        name: 'Wyszukiwanie',
        description: 'Szybkie wyszukiwanie klientów, zgłoszeń, urządzeń.',
        examples: ['Znajdź klienta Kowalski', 'Szukaj zgłoszenia drukarka', 'Pokaż urządzenia serwer'],
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
        examples: ['Dostępne w szczegółach zgłoszenia / na liście zadań'],
        tag: 'auto',
      },
    ],
  },
];

const AGENT_COMMANDS: { group: string; commands: Command[] }[] = [
  {
    group: 'Zarządzanie systemem',
    commands: [
      { icon: <Download className="h-4 w-4" />, name: 'Windows Update', description: 'Zdalne uruchomienie aktualizacji Windows. Możliwość zaplanowania restartu.', examples: ['Aktualizuj Windows na stacji PC-001'], tag: 'ADMIN' },
      { icon: <Power className="h-4 w-4" />, name: 'Restart systemu', description: 'Zdalny restart komputera z konfigurowalnym opóźnieniem.', examples: ['Uruchom ponownie PC-BIURO-3'], tag: 'ADMIN' },
      { icon: <RefreshCw className="h-4 w-4" />, name: 'Restart usługi', description: 'Zatrzymanie i ponowne uruchomienie dowolnej usługi Windows.', examples: ['Zrestartuj usługę Spooler na PC-001'], tag: 'ADMIN' },
      { icon: <Wifi className="h-4 w-4" />, name: 'Wake on LAN', description: 'Zdalne wybudzenie komputera przez sieć lokalną.', examples: ['Wybudź komputer PC-MAGAZYN'], tag: 'ADMIN + TECH' },
    ],
  },
  {
    group: 'Monitoring i diagnostyka',
    commands: [
      { icon: <Cpu className="h-4 w-4" />, name: 'Informacje o systemie', description: 'Hostname, OS, domena, CPU, RAM, GPU, płyta główna, numer seryjny.', examples: ['Zbierane automatycznie'], tag: 'auto' },
      { icon: <HardDrive className="h-4 w-4" />, name: 'Dyski i partycje', description: 'Lista partycji z pojemnością, wolnym miejscem i procentem użycia.', examples: ['Automatyczne raportowanie'], tag: 'auto' },
      { icon: <Globe className="h-4 w-4" />, name: 'Interfejsy sieciowe', description: 'Lista interfejsów: nazwa, IP, MAC, status połączenia.', examples: ['Automatyczne raportowanie'], tag: 'auto' },
      { icon: <BarChart3 className="h-4 w-4" />, name: 'Metryki wydajności', description: 'Okresowy pomiar CPU, RAM, dysków.', examples: ['CPU: 45%, RAM: 8.2/16 GB'], tag: 'auto' },
      { icon: <Thermometer className="h-4 w-4" />, name: 'Temperatura CPU', description: 'Odczyt temperatury procesora przez WMI.', examples: ['CPU: 62°C'], tag: 'auto' },
      { icon: <Monitor className="h-4 w-4" />, name: 'Zainstalowane oprogramowanie', description: 'Lista oprogramowania z wersją i wydawcą.', examples: ['Automatyczny audyt'], tag: 'auto' },
      { icon: <Shield className="h-4 w-4" />, name: 'Auto-diagnostyka', description: 'Automatyczne sprawdzanie stanu systemu co 5 minut.', examples: ['Uruchamiane w tle'], tag: 'auto' },
    ],
  },
  {
    group: 'Zdalny dostęp i backup',
    commands: [
      { icon: <Terminal className="h-4 w-4" />, name: 'RustDesk / AnyDesk / TeamViewer', description: 'Automatyczne wykrywanie ID zdalnego dostępu.', examples: ['Pokaż ID RustDesk'], tag: 'ADMIN + TECH' },
      { icon: <Camera className="h-4 w-4" />, name: 'Zrzut ekranu', description: 'Zdalne pobranie zrzutu ekranu ze stacji roboczej.', examples: ['Screenshot PC-BIURO-5'], tag: 'ADMIN' },
      { icon: <HardDrive className="h-4 w-4" />, name: 'Backup', description: 'Uruchomienie kopii zapasowej wg konfiguracji.', examples: ['Uruchom backup ID 3'], tag: 'ADMIN' },
    ],
  },
  {
    group: 'Zarządzanie agentem',
    commands: [
      { icon: <Download className="h-4 w-4" />, name: 'Auto-aktualizacja', description: 'Zdalne wysłanie nowej wersji agenta na stację roboczą.', examples: ['Aktualizuj agenta na PC-001'], tag: 'ADMIN' },
    ],
  },
];

/* ── Components ── */

function CommandCard({ cmd }: { cmd: Command }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="aip-card" onClick={() => setExpanded(e => !e)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="aip-card-icon">{cmd.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>{cmd.name}</span>
            {cmd.tag && (
              <span className={`aip-tag ${cmd.tag === 'auto' ? 'auto' : cmd.tag === 'ADMIN' ? 'admin' : 'tech'}`}>
                {cmd.tag === 'auto' ? 'Automatyczne' : cmd.tag}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0', lineHeight: 1.4 }}>{cmd.description}</p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 34 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Przykłady</p>
          {cmd.examples.map((ex, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
              <Mic className="h-3 w-3" style={{ color: '#8B5CF6', marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>"{ex}"</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Login form ── */
const schema = z.object({
  email: z.string().email('Podaj poprawny email'),
  password: z.string().min(1, 'Hasło wymagane'),
});

function LoginForm({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState('');
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      const res = await authApi.login(data.email, data.password);
      storeSession(res.accessToken, res.refreshToken, res.user);
      onSuccess(res.user);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Nieprawidłowy email lub hasło');
    } finally { setLoading(false); }
  };

  const inputStyle = (name: string, hasError?: string) => ({
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : focused === name ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.06)'}`,
    color: 'rgba(255,255,255,0.9)',
    boxShadow: focused === name ? '0 0 0 3px rgba(139,92,246,0.08)' : 'none',
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#040a16' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[10%] left-[20%] w-[50%] h-[40%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.06), transparent 70%)' }} />
        <div className="absolute bottom-[15%] right-[10%] w-[40%] h-[35%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.04), transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <Sparkles className="h-8 w-8" style={{ color: '#8B5CF6' }} />
          </div>
          <h1 className="text-[22px] font-bold text-white/90 mb-1">Asystent AI</h1>
          <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Panel poleceń głosowych InfraDesk
          </p>
        </div>

        {/* Card */}
        <div className="rounded-[22px] overflow-hidden" style={{
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', backdropFilter: 'blur(16px)',
        }}>
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, rgba(37,99,235,0))' }} />

          <div className="p-6 sm:p-8">
            <h2 className="text-[18px] font-semibold text-white/90 mb-1">Zaloguj się</h2>
            <p className="text-[12px] mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>Użyj danych z panelu InfraDesk</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  <input type="email" placeholder="jan@firma.pl" {...register('email')}
                    onFocus={() => setFocused('email')} onBlur={() => setFocused('')}
                    className="w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none transition-all placeholder:text-white/20"
                    style={inputStyle('email', errors.email?.message)} />
                </div>
                {errors.email && <p className="text-[11px] text-red-400/70 mt-1.5">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Hasło</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  <input type="password" placeholder="••••••••" {...register('password')}
                    onFocus={() => setFocused('password')} onBlur={() => setFocused('')}
                    className="w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none transition-all placeholder:text-white/20"
                    style={inputStyle('password', errors.password?.message)} />
                </div>
                {errors.password && <p className="text-[11px] text-red-400/70 mt-1.5">{errors.password.message}</p>}
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-[14px] rounded-[14px] text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 12px rgba(79,140,255,0.2)' }}>
                {loading ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Zaloguj się <ArrowRight className="h-4 w-4 opacity-60" /></>}
              </button>
            </form>

            <p className="text-center text-[10px] mt-6" style={{ color: 'rgba(255,255,255,0.15)' }}>
              by SILERS · panel.silers.pl
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Panel (after login) ── */
function AiPanel({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<'panel' | 'agent'>('panel');

  return (
    <div className="min-h-screen" style={{ background: '#040a16' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[5%] left-[10%] w-[50%] h-[40%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.05), transparent 70%)' }} />
        <div className="absolute bottom-[10%] right-[5%] w-[40%] h-[35%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.03), transparent 70%)' }} />
      </div>

      <div className="relative z-10 max-w-[900px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <Sparkles className="h-5 w-5" style={{ color: '#8B5CF6' }} />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-white/90">Asystent AI — Polecenia</h1>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Zalogowano jako {user.firstName} {user.lastName}
                <span style={{ color: 'rgba(255,255,255,0.2)' }}></span>
              </p>
            </div>
          </div>
          <button onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-all hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <LogOut className="h-3.5 w-3.5" /> Wyloguj
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setTab('panel')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${tab === 'panel' ? 'text-white' : ''}`}
            style={tab === 'panel' ? { background: 'linear-gradient(135deg, #6D28D9, #4F46E5)', boxShadow: '0 2px 12px rgba(109,40,217,0.3)' } : { color: 'rgba(255,255,255,0.4)' }}>
            <Sparkles className="h-4 w-4" />
            Panel InfraDesk
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.15)' }}>
              {PANEL_COMMANDS.reduce((n, g) => n + g.commands.length, 0)}
            </span>
          </button>
          <button onClick={() => setTab('agent')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${tab === 'agent' ? 'text-white' : ''}`}
            style={tab === 'agent' ? { background: 'linear-gradient(135deg, #6D28D9, #4F46E5)', boxShadow: '0 2px 12px rgba(109,40,217,0.3)' } : { color: 'rgba(255,255,255,0.4)' }}>
            <Monitor className="h-4 w-4" />
            Asystent (Agent)
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.15)' }}>
              {AGENT_COMMANDS.reduce((n, g) => n + g.commands.length, 0)}
            </span>
          </button>
        </div>

        {/* Content */}
        {tab === 'panel' ? (
          <div>
            <div className="flex gap-3 p-3 rounded-xl mb-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <Mic className="h-4 w-4 mt-0.5" style={{ color: '#8B5CF6', flexShrink: 0 }} />
              <div>
                <p className="text-[12px] font-semibold text-white/80 mb-0.5">Sterowanie głosowe panelu</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                  W panelu InfraDesk kliknij przycisk <strong className="text-purple-400">Sparkles</strong> w prawym dolnym rogu,
                  naciśnij mikrofon i wydaj polecenie po polsku. AI rozpozna mowę i automatycznie wykona akcję.
                </p>
              </div>
            </div>

            {PANEL_COMMANDS.map(g => (
              <div key={g.group} className="mb-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] mb-2 pl-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{g.group}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {g.commands.map(c => <CommandCard key={c.name} cmd={c} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex gap-3 p-3 rounded-xl mb-3" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.1)' }}>
              <Monitor className="h-4 w-4 mt-0.5" style={{ color: '#4ADE80', flexShrink: 0 }} />
              <div>
                <p className="text-[12px] font-semibold text-white/80 mb-0.5">Agent desktopowy</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                  Agent InfraDesk działa jako usługa Windows. Zbiera dane o systemie, wykonuje polecenia zdalne
                  i monitoruje wydajność. Wymaga zatwierdzenia w <strong className="text-green-400">Poczekalnia agentów</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-3 rounded-xl mb-4" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.1)' }}>
              <Shield className="h-4 w-4 mt-0.5" style={{ color: '#FBBF24', flexShrink: 0 }} />
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                <strong className="text-white/70">Uprawnienia: </strong>
                <span className="aip-tag admin">ADMIN</span> — administrator,{' '}
                <span className="aip-tag tech">ADMIN + TECH</span> — admin i technik,{' '}
                <span className="aip-tag auto">Automatyczne</span> — agent wykonuje sam.
              </p>
            </div>

            {AGENT_COMMANDS.map(g => (
              <div key={g.group} className="mb-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] mb-2 pl-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{g.group}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {g.commands.map(c => <CommandCard key={c.name} cmd={c} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-10 pb-6">
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
            InfraDesk AI · by SILERS · panel.silers.pl
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ── */
export default function AiPanelPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getStoredSession();
    if (session) setUser(session.user);
    setLoading(false);
  }, []);

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#040a16' }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#8B5CF6' }} />
      </div>
    );
  }

  if (!user) {
    return <LoginForm onSuccess={setUser} />;
  }

  return <AiPanel user={user} onLogout={handleLogout} />;
}
