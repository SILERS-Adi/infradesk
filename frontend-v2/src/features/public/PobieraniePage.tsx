import { useEffect, useState } from 'react';
import {
  Download, Lock, Check, ExternalLink, Loader2, ShieldCheck, Bot, MonitorPlay,
  Apple, Smartphone, Terminal, Mail, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePageMeta } from '@/hooks/usePageMeta';

interface VersionInfo {
  version: string;
  url: string;
  sha256?: string;
  releasedAt?: string;
  notes?: string;
}

function useAsystentVersion() {
  const [data, setData] = useState<VersionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/downloads/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not_found'))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  return { data, error };
}

interface RustdeskUnlock {
  url: string;
  fileName: string;
}

export function PobieraniePage() {
  usePageMeta({
    title: 'Pobieranie',
    description: 'Pobierz Asystenta Business InfraDesk dla Windows. RustDesk dostępny po wpisaniu PIN-u (otrzymujesz od helpdesku).',
  });
  const asystent = useAsystentVersion();

  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<RustdeskUnlock | null>(null);

  async function verifyPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setPinError(null);
    try {
      const r = await api.post<RustdeskUnlock & { ok: boolean }>('/public/downloads/verify-pin', { pin: pin.trim() });
      setUnlocked({ url: r.data.url, fileName: r.data.fileName });
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { message?: string } } };
      if (ax.response?.status === 429) {
        setPinError('Za dużo prób. Spróbuj ponownie za chwilę.');
      } else {
        setPinError(ax.response?.data?.message ?? 'Nieprawidłowy PIN');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-5 py-12 md:py-16">
      <div className="max-w-[900px] mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Pobieranie</p>
          <h1 className="text-[34px] md:text-[42px] font-bold tracking-tight mb-3">
            Pobierz Asystenta InfraDesk
          </h1>
          <p className="text-[14px] text-tx2 max-w-[600px] mx-auto">
            Klient na Windows łączy stację z Twoim helpdeskiem.
            Zgłoszenia ze screenem, audyt bezpieczeństwa, zdalny dostęp przez RustDesk.
          </p>
        </div>

        {/* Asystent — public download */}
        <div
          className="rounded-[var(--r-l)] p-6 md:p-8 border mb-5"
          style={{ borderColor: 'var(--pri)', background: 'linear-gradient(135deg, var(--pri-l) 0%, var(--sf) 70%)' }}
        >
          <div className="flex items-start gap-4 flex-wrap">
            <div
              className="w-14 h-14 rounded-[var(--r-m)] flex items-center justify-center shrink-0"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              <Bot className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-[20px] font-bold">Asystent Business</h2>
                {asystent.data?.version && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}
                  >
                    v{asystent.data.version}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-tx2 leading-relaxed mb-3">
                Aplikacja dla pracowników. Auto-update, działa w tle, integruje się z RustDesk-iem,
                zbiera audyt bezpieczeństwa raz dziennie.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {asystent.data ? (
                  <a
                    href={asystent.data.url}
                    download
                    className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press"
                    style={{ background: 'var(--pri)', color: 'white' }}
                  >
                    <Download className="h-4 w-4" />
                    Pobierz dla Windows
                  </a>
                ) : asystent.error ? (
                  <span className="text-[12px] text-er">Plik chwilowo niedostępny — odśwież za chwilę.</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-tx3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sprawdzam wersję…
                  </span>
                )}
                {asystent.data?.releasedAt && (
                  <span className="text-[11px] text-tx3">
                    Wydany {new Date(asystent.data.releasedAt).toLocaleDateString('pl-PL')}
                  </span>
                )}
                {asystent.data?.sha256 && (
                  <span className="text-[10px] font-mono text-tx3 truncate max-w-[280px]" title={asystent.data.sha256}>
                    SHA-256: {asystent.data.sha256.slice(0, 16)}…
                  </span>
                )}
              </div>
              {asystent.data?.notes && (
                <p className="text-[12px] text-tx3 mt-3 leading-relaxed border-l-2 pl-3" style={{ borderColor: 'var(--bd)' }}>
                  {asystent.data.notes}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]" style={{ borderColor: 'var(--bd)' }}>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-ok" />
              <span className="text-tx2">Windows 10/11</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-ok" />
              <span className="text-tx2">Auto-update</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-ok" />
              <span className="text-tx2">Tray + autostart</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-ok" />
              <span className="text-tx2">Podpisany cyfrowo</span>
            </div>
          </div>
        </div>

        {/* RustDesk — PIN gated */}
        <div
          className="rounded-[var(--r-l)] p-6 md:p-8 border"
          style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
        >
          <div className="flex items-start gap-4 flex-wrap">
            <div
              className="w-14 h-14 rounded-[var(--r-m)] flex items-center justify-center shrink-0 relative"
              style={{ background: 'var(--sf-h)', color: 'var(--tx2)' }}
            >
              <MonitorPlay className="h-7 w-7" />
              {!unlocked && (
                <div
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--wn)', color: 'white', border: '2px solid var(--sf)' }}
                >
                  <Lock className="h-3 w-3" />
                </div>
              )}
              {unlocked && (
                <div
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--ok)', color: 'white', border: '2px solid var(--sf)' }}
                >
                  <Check className="h-3 w-3" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-[20px] font-bold">RustDesk</h2>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={unlocked
                    ? { background: 'var(--ok-l)', color: 'var(--ok)' }
                    : { background: 'var(--sf-h)', color: 'var(--tx3)', border: '1px solid var(--bd)' }}
                >
                  {unlocked ? 'Odblokowane' : 'Chronione PIN-em'}
                </span>
              </div>
              <p className="text-[13px] text-tx2 leading-relaxed mb-4">
                Klient zdalnego pulpitu używany przez naszych techników do połączenia z Twoją stacją.
                Pobieranie chronione PIN-em — dostaniesz go od helpdesku przy pierwszym kontakcie.
              </p>

              {!unlocked ? (
                <form onSubmit={verifyPin} className="flex flex-col sm:flex-row items-stretch gap-2 max-w-[440px]">
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Wpisz PIN…"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setPinError(null); }}
                    disabled={submitting}
                    className="flex-1 h-10 px-3 rounded-[var(--r-s)] border text-[13px] font-mono"
                    style={{
                      borderColor: pinError ? 'var(--er)' : 'var(--bd)',
                      background: 'var(--bg)',
                      color: 'var(--tx)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !pin.trim()}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[var(--r-s)] text-[13px] font-semibold press disabled:opacity-50"
                    style={{ background: 'var(--pri)', color: 'white' }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    {submitting ? 'Sprawdzam…' : 'Odblokuj'}
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <a
                    href={unlocked.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press"
                    style={{ background: 'var(--ok)', color: 'white' }}
                  >
                    <Download className="h-4 w-4" />
                    Pobierz {unlocked.fileName}
                  </a>
                  <a
                    href="https://rustdesk.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-tx3 hover:text-tx press"
                  >
                    <ExternalLink className="h-3 w-3" /> rustdesk.com
                  </a>
                </div>
              )}

              {pinError && (
                <p className="text-[12px] text-er mt-2">{pinError}</p>
              )}
              {!unlocked && (
                <p className="text-[11px] text-tx3 mt-3">
                  Nie masz PIN-u? Napisz na <a href="mailto:biuro@silers.pl" className="text-pri hover:underline">biuro@silers.pl</a> lub przez <a href="/kontakt" className="text-pri hover:underline">formularz kontaktowy</a>.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Jak zainstalować — krok po kroku */}
        <section className="mt-12">
          <div className="text-center mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Pierwsze kroki</p>
            <h2 className="text-[24px] md:text-[28px] font-bold tracking-tight">Jak zainstalować Asystenta</h2>
            <p className="text-[13px] text-tx2 max-w-[600px] mx-auto mt-2">
              Cała operacja zajmuje 2-3 minuty. Wymagane uprawnienia administratora Windows do zainstalowania usługi w tle.
            </p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { n: 1, title: 'Pobierz instalator', desc: 'Kliknij "Pobierz dla Windows" powyżej. Plik ~12 MB, podpisany cyfrowo (możesz zignorować ostrzeżenie SmartScreen).' },
              { n: 2, title: 'Uruchom jako administrator', desc: 'Kliknij prawym → "Uruchom jako administrator". Potrzebne żeby zainstalować usługę systemową.' },
              { n: 3, title: 'Zaloguj się danymi z panelu', desc: 'Po instalacji wpisz email + hasło z którym założyłeś konto na infradesk.pl. Asystent dopisze stację do listy urządzeń automatycznie.' },
              { n: 4, title: 'Sprawdź w panelu', desc: 'Wejdź na infradesk.pl → Urządzenia. Twoja stacja powinna pojawić się na zielono w ciągu 30 sekund. Audyt bezpieczeństwa odpali się automatycznie.' },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-[var(--r-m)] p-4 border flex items-start gap-3"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px]"
                  style={{ background: 'var(--pri)', color: 'white' }}
                >
                  {step.n}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold mb-0.5">{step.title}</h3>
                  <p className="text-[12px] text-tx2 leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Wkrótce: Mac/Linux/Mobile */}
        <section className="mt-12">
          <div className="text-center mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-wn mb-2">Wkrótce</p>
            <h2 className="text-[24px] md:text-[28px] font-bold tracking-tight">Inne platformy</h2>
            <p className="text-[13px] text-tx2 max-w-[600px] mx-auto mt-2">
              Asystent dla macOS i Linux jest w fazie beta-testów. Mobilna apka iOS/Android — w planach na 2026 Q3.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: Apple,      title: 'macOS',       desc: 'Asystent dla Mac (Apple Silicon + Intel). Wczesna beta.', cta: 'Zgłoś się na beta-listę' },
              { icon: Terminal,   title: 'Linux',       desc: 'Pakiet .deb / .rpm dla Ubuntu / RHEL / Fedora. Beta.', cta: 'Zgłoś się na beta-listę' },
              { icon: Smartphone, title: 'iOS / Android', desc: 'Mobile app — zgłoszenia i powiadomienia push. Roadmapa Q3 2026.', cta: 'Powiadom mnie' },
            ].map((p) => (
              <div
                key={p.title}
                className="rounded-[var(--r-m)] p-5 border text-center"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)', opacity: 0.85 }}
              >
                <div
                  className="w-12 h-12 rounded-[var(--r-m)] mx-auto mb-3 flex items-center justify-center"
                  style={{ background: 'var(--sf-h)', color: 'var(--tx2)' }}
                >
                  <p.icon className="h-6 w-6" />
                </div>
                <h3 className="text-[14px] font-bold mb-1">{p.title}</h3>
                <p className="text-[12px] text-tx3 leading-relaxed mb-3">{p.desc}</p>
                <a
                  href={`mailto:biuro@silers.pl?subject=Asystent ${p.title} — beta&body=Cześć,%0A%0AChcę dostać dostęp do Asystenta na ${p.title} jak będzie gotowy.%0A%0ANIP firmy: %0AUżywany system: %0A%0APozdrawiam`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold press"
                  style={{ color: 'var(--pri)' }}
                >
                  <Mail className="h-3 w-3" /> {p.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12 max-w-[760px] mx-auto">
          <div className="text-center mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">FAQ</p>
            <h2 className="text-[24px] md:text-[28px] font-bold tracking-tight">Najczęstsze pytania</h2>
          </div>
          <div className="space-y-2">
            {[
              {
                q: 'Czy mogę zainstalować Asystenta na 100 stacjach jednym kliknięciem?',
                a: 'Tak — przygotowujemy MSI z silent install dla GPO / Intune / SCCM. Napisz na biuro@silers.pl, wyślemy.',
              },
              {
                q: 'Czy Asystent ma auto-update?',
                a: 'Tak. Asystent sprawdza nową wersję raz na 2 godziny i aktualizuje się sam (bez restartu, bez interwencji użytkownika). Wszystkie wersje podpisane cyfrowo.',
              },
              {
                q: 'Co Asystent wysyła do Was?',
                a: 'Telemetrię stanu sprzętu (CPU/RAM/dysk/uptime), wyniki audytu bezpieczeństwa (BitLocker, RDP NLA itd.), listę zainstalowanego softu, aktywnego usera. Nie wysyła plików, treści maili, screenów (chyba że robisz zgłoszenie). Pełna lista w polityce prywatności.',
              },
              {
                q: 'Czy potrzebuję otworzyć porty na firewallu?',
                a: 'Nie. Asystent łączy się WYJŚCIOWO przez TLS 443 (jak przeglądarka). Nie otwiera portów lokalnie. Na firewallu firmowym wystarczy że dozwolony jest ruch HTTPS na *.infradesk.pl.',
              },
              {
                q: 'Czy mogę zainstalować Asystenta na serwerach (Windows Server)?',
                a: 'Tak. Asystent wspiera Windows Server 2016/2019/2022. Dodatkowo zbiera S.M.A.R.T. dysków, status pool/RAID i Windows Service health.',
              },
              {
                q: 'Co jeśli stacja jest offline?',
                a: 'Asystent zbiera dane lokalnie i synchronizuje gdy wróci do sieci (queue do 7 dni). W panelu widzisz "ostatnio: 2h temu" i alert "stacja offline > X minut" jeśli skonfigurowałeś.',
              },
              {
                q: 'Jak odinstalować Asystenta?',
                a: 'Standardowy "Dodaj/Usuń programy" w Windows. Dane na serwerze pozostają (żebyś mógł zobaczyć historię), ale możesz je usunąć z panelu w Urządzenia → Wycofaj.',
              },
              {
                q: 'Czy RustDesk to wasz produkt?',
                a: 'Nie. RustDesk to open-source klient zdalnego pulpitu (https://rustdesk.com). My tylko hostujemy własny relay server i zapewniamy bezpieczne PIN-y do pobierania.',
              },
            ].map((item) => (
              <details
                key={item.q}
                className="rounded-[var(--r-s)] border p-4 group"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <summary className="cursor-pointer text-[13px] font-semibold list-none flex items-center justify-between gap-3">
                  <span>{item.q}</span>
                  <span className="text-tx3 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-[12px] text-tx2 mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="text-center mt-6">
            <a
              href="/kontakt"
              className="inline-flex items-center gap-1 text-[13px] font-semibold press"
              style={{ color: 'var(--pri)' }}
            >
              Masz inne pytanie? Napisz <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
