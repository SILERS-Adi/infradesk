/**
 * InfraDesk UX 1.0 — Module Configurator / Onboarding
 * Premium SaaS — Stripe/Linear/Notion motion polish
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Monitor, FileText, Package, Car, Headphones, Check, X,
  ChevronRight, Plug, Zap, ArrowRight, MessageCircle,
  Building2, Users, Globe, ShoppingCart, Scan, Calendar, Sparkles, Settings2,
} from 'lucide-react';
import { useTheme } from '../../store/themeStore';

// ── Types ──
interface ModuleDef { id: string; name: string; description: string; icon: React.ElementType; features: string[]; priceFrom: number; hasModal?: boolean; }
interface AddonDef { id: string; name: string; description: string; price: number | null; badge?: string; icon: React.ElementType; }

// ── Infra pricing helpers ──
const SOLO_SEATS = [
  { max: 1, price: 0, label: '1' },
  { max: 3, price: 29, label: '2–3' },
  { max: 6, price: 49, label: '4–6' },
  { max: 10, price: 69, label: '7–10' },
  { max: 20, price: 99, label: '11–20' },
  { max: 50, price: 149, label: '21–50' },
];
const SOLO_REMOTE = [
  { max: 0, price: 0, label: '0' },
  { max: 1, price: 9, label: '1' },
  { max: 2, price: 18, label: '2' },
  { max: 3, price: 27, label: '3' },
  { max: 5, price: 39, label: '5' },
  { max: 10, price: 69, label: '10' },
];
const MULTI_COMPANIES = [
  { max: 3, price: 0, label: 'do 3' },
  { max: 10, price: 30, label: 'do 10' },
  { max: 25, price: 60, label: 'do 25' },
  { max: 50, price: 120, label: 'do 50' },
];
const MULTI_SEATS = [
  { max: 25, price: 0, label: 'do 25' },
  { max: 50, price: 20, label: 'do 50' },
  { max: 100, price: 50, label: 'do 100' },
  { max: 250, price: 100, label: 'do 250' },
];
const MULTI_REMOTE = [
  { max: 1, price: 0, label: '1' },
  { max: 3, price: 25, label: '3' },
  { max: 5, price: 39, label: '5' },
  { max: 10, price: 69, label: '10' },
];

interface InfraConfig {
  mode: 'solo' | 'multi';
  soloSeats: number;
  soloRemote: number;
  multiCompanies: number;
  multiSeats: number;
  multiRemote: number;
}
const defaultInfraConfig: InfraConfig = { mode: 'solo', soloSeats: 0, soloRemote: 0, multiCompanies: 0, multiSeats: 0, multiRemote: 0 };

function calcInfraPrice(cfg: InfraConfig): { total: number; lines: { label: string; price: number }[] } {
  const lines: { label: string; price: number }[] = [];
  if (cfg.mode === 'solo') {
    const s = SOLO_SEATS[cfg.soloSeats]; const r = SOLO_REMOTE[cfg.soloRemote];
    lines.push({ label: `Stanowiska (${s.label})`, price: s.price });
    lines.push({ label: `Połączenia zdalne (${r.label})`, price: r.price });
    return { total: s.price + r.price, lines };
  }
  const base = 99;
  const c = MULTI_COMPANIES[cfg.multiCompanies]; const s = MULTI_SEATS[cfg.multiSeats]; const r = MULTI_REMOTE[cfg.multiRemote];
  lines.push({ label: 'Baza MULTI', price: base });
  lines.push({ label: `Firmy (${c.label})`, price: c.price });
  lines.push({ label: `Stanowiska (${s.label})`, price: s.price });
  lines.push({ label: `Połączenia (${r.label})`, price: r.price });
  return { total: base + c.price + s.price + r.price, lines };
}

function infraSummary(cfg: InfraConfig): string {
  if (cfg.mode === 'solo') {
    return `SOLO • ${SOLO_SEATS[cfg.soloSeats].label} stan. • ${SOLO_REMOTE[cfg.soloRemote].label} poł.`;
  }
  return `MULTI • ${MULTI_COMPANIES[cfg.multiCompanies].label} firm • ${MULTI_SEATS[cfg.multiSeats].label} stan.`;
}

function isDefaultInfraConfig(cfg: InfraConfig): boolean {
  return cfg.mode === 'solo' && cfg.soloSeats === 0 && cfg.soloRemote === 0;
}

// ── Data ──
const MODULES: ModuleDef[] = [
  { id: 'infra', name: 'Zarządzanie IT', description: 'Pełna kontrola nad środowiskiem IT firmy.', icon: Monitor, features: ['Zarządzanie komputerami', 'Użytkownicy i uprawnienia', 'Monitoring sieci', 'Obsługa środowiska IT'], priceFrom: 0, hasModal: true },
  { id: 'diagnostic', name: 'Stacje diagnostyczne', description: 'Moduł branżowy dla SKP i motoryzacji.', icon: Car, features: ['Zarządzanie terminami', 'Przypomnienia klientów', 'Procesy stacji', 'Dokumentacja przeglądów'], priceFrom: 99 },
  { id: 'sales', name: 'Sprzedaż', description: 'Faktury, paragony i dokumenty handlowe.', icon: FileText, features: ['Faktury sprzedaży i zakupu', 'Paragony', 'Kartoteka towarów', 'Integracja API z platformami'], priceFrom: 59 },
  { id: 'packing', name: 'Pakowanie', description: 'Sprawny fulfillment zamówień.', icon: Package, features: ['Kompletacja zamówień', 'Skanowanie produktów', 'Statusy pakowania', 'Integracja API z platformami'], priceFrom: 79 },
];
const ADDONS: AddonDef[] = [
  { id: 'api-integration', name: 'Integracja API', description: 'Podłącz Allegro, sklep internetowy, ERP lub własny system — jeśli posiada API.', price: 10, icon: Plug },
  { id: 'it-support', name: 'Obsługa informatyczna', description: 'Nie masz IT? Zajmiemy się wszystkim za Ciebie.', price: 99, icon: Headphones },
  { id: 'onboarding', name: 'Pomoc przy wdrożeniu', description: 'Pomożemy Ci uruchomić system krok po kroku.', price: null, badge: 'GRATIS 14 dni', icon: Zap },
];

// ── Animated counter ──
function AnimatedPrice({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current; const end = value; const dur = 350;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    prev.current = value;
  }, [value]);
  return <>{display}</>;
}

// ── Expandable section ──
function ExpandSection({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (ref.current) setHeight(open ? ref.current.scrollHeight : 0);
  }, [open, children]);
  return (
    <div style={{ overflow: 'hidden', height, opacity: open ? 1 : 0, transition: 'height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease' }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

// ── Viewport fade-in observer ──
function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
    }}>{children}</div>
  );
}

// ── Stepped slider ──
function StepSlider({ steps, value, onChange, label }: { steps: { label: string; price: number }[]; value: number; onChange: (v: number) => void; label: string }) {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const ease = 'cubic-bezier(0.16,1,0.3,1)';
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 750, color: '#4F46E5', fontVariantNumeric: 'tabular-nums' }}>
          {steps[value].label} — {steps[value].price === 0 ? 'w cenie' : `${steps[value].price} zł`}
        </span>
      </div>
      <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
        {/* Track */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, background: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)' }} />
        <div style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #4F46E5, #7C3AED)', width: `${(value / (steps.length - 1)) * 100}%`, transition: `width 0.25s ${ease}` }} />
        {/* Steps dots */}
        {steps.map((_, i) => (
          <div key={i} onClick={() => onChange(i)} style={{
            position: 'absolute', left: `${(i / (steps.length - 1)) * 100}%`, transform: 'translateX(-50%)',
            width: i === value ? 20 : 10, height: i === value ? 20 : 10, borderRadius: '50%',
            background: i <= value ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : isLight ? '#CBD5E1' : 'rgba(255,255,255,0.15)',
            border: i === value ? '3px solid #fff' : 'none',
            boxShadow: i === value ? '0 2px 8px rgba(79,70,229,0.4)' : 'none',
            cursor: 'pointer', transition: `all 0.25s ${ease}`, zIndex: 2,
          }} />
        ))}
        {/* Invisible range input for drag */}
        <input type="range" min={0} max={steps.length - 1} value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: 40, opacity: 0, cursor: 'pointer', zIndex: 3 }} />
      </div>
      {/* Step labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {steps.map((s, i) => (
          <span key={i} style={{ fontSize: 10, color: i === value ? '#4F46E5' : 'var(--tm)', fontWeight: i === value ? 700 : 400, transition: `all 0.2s ease`, minWidth: 0, textAlign: 'center' }}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Infra Config Modal ──
function InfraModal({ open, initial, onApply, onCancel }: { open: boolean; initial: InfraConfig; onApply: (cfg: InfraConfig) => void; onCancel: () => void }) {
  const [cfg, setCfg] = useState<InfraConfig>(initial);
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const ease = 'cubic-bezier(0.16,1,0.3,1)';
  const pricing = calcInfraPrice(cfg);

  useEffect(() => { if (open) setCfg(initial); }, [open, initial]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'cfgFadeIn 0.2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 660, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-card)', borderRadius: 24, padding: '36px 40px',
        boxShadow: '0 25px 80px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.1)',
        animation: 'cfgModalIn 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              <Monitor size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em' }}>Zarządzanie IT</div>
              <div style={{ fontSize: 13, color: 'var(--ts)' }}>Skonfiguruj moduł pod swoje potrzeby</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `all 0.2s ease` }}
            onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; }}>
            <X size={16} color="var(--ts)" />
          </button>
        </div>

        {/* Mode selector */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--tm)', marginBottom: 14 }}>Tryb</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {([
              { id: 'solo' as const, name: 'SOLO', desc: 'Dla jednej firmy', icon: Building2 },
              { id: 'multi' as const, name: 'MULTI', desc: 'Dla firm IT i wielu podmiotów', icon: Users },
            ]).map(m => {
              const sel = cfg.mode === m.id;
              const MI = m.icon;
              return (
                <div key={m.id} onClick={() => setCfg({ ...cfg, mode: m.id })} style={{
                  padding: '22px 24px', borderRadius: 16, cursor: 'pointer',
                  background: sel ? (isLight ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF)' : 'rgba(79,70,229,0.1)') : (isLight ? '#FAFBFC' : 'rgba(255,255,255,0.03)'),
                  border: `2px solid ${sel ? '#818CF8' : 'var(--border)'}`,
                  boxShadow: sel ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  transition: `all 0.25s ${ease}`,
                  transform: sel ? 'scale(1.01)' : 'scale(1)',
                }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#C7D2FE'; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: sel ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)'), display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `all 0.25s ${ease}` }}>
                      <MI size={18} color={sel ? '#fff' : 'var(--tm)'} />
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: sel ? '#4F46E5' : 'var(--t)', transition: `color 0.2s ease` }}>{m.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ts)', paddingLeft: 46 }}>{m.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--tm)', marginBottom: 20 }}>Konfiguracja</div>
          {cfg.mode === 'solo' ? (
            <>
              <StepSlider label="Stanowiska" steps={SOLO_SEATS} value={cfg.soloSeats} onChange={v => setCfg({ ...cfg, soloSeats: v })} />
              <StepSlider label="Połączenia zdalne" steps={SOLO_REMOTE} value={cfg.soloRemote} onChange={v => setCfg({ ...cfg, soloRemote: v })} />
            </>
          ) : (
            <>
              <StepSlider label="Liczba firm" steps={MULTI_COMPANIES} value={cfg.multiCompanies} onChange={v => setCfg({ ...cfg, multiCompanies: v })} />
              <StepSlider label="Stanowiska" steps={MULTI_SEATS} value={cfg.multiSeats} onChange={v => setCfg({ ...cfg, multiSeats: v })} />
              <StepSlider label="Połączenia zdalne" steps={MULTI_REMOTE} value={cfg.multiRemote} onChange={v => setCfg({ ...cfg, multiRemote: v })} />
            </>
          )}
        </div>

        {/* Pricing summary */}
        <div style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 28, background: 'linear-gradient(145deg, #F0FDF4, #ECFDF5, #D1FAE5)', border: '1px solid rgba(16,185,129,0.12)' }}>
          {pricing.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < pricing.lines.length - 1 ? '1px solid rgba(16,185,129,0.1)' : 'none' }}>
              <span style={{ fontSize: 14, color: '#064E3B', fontWeight: 500 }}>{l.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', fontVariantNumeric: 'tabular-nums' }}>{l.price === 0 ? 'w cenie' : `${l.price} zł`}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, marginTop: 8, borderTop: '2px solid rgba(16,185,129,0.2)' }}>
            <span style={{ fontSize: 16, fontWeight: 750, color: '#064E3B' }}>Razem:</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: '-0.03em' }}>{pricing.total} zł<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ts)' }}> / msc</span></span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--ts)', fontSize: 15, fontWeight: 650, cursor: 'pointer', transition: `all 0.2s ${ease}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#F8FAFC' : 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
          >Anuluj</button>
          <button onClick={() => onApply(cfg)} style={{
            flex: 2, padding: '16px 20px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
            fontSize: 15, fontWeight: 750, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(79,70,229,0.35)', transition: `all 0.25s ${ease}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.35)'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; }}
          ><Check size={18} /> Zastosuj konfigurację</button>
        </div>
      </div>
    </div>
  );
}

// ── Integration Config Modal (for Sales & Packing) ──
// ── Scenario generation ──
interface ScenarioStep { icon: React.ElementType; title: string; desc: string; }

function generateScenario(modules: Set<string>, infraCfg: InfraConfig): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  const hasInfra = modules.has('infra');
  const hasSales = modules.has('sales');
  const hasPacking = modules.has('packing');
  const hasDiag = modules.has('diagnostic');

  if (hasInfra && infraCfg.mode === 'multi' && infraCfg.multiRemote > 0) {
    // MULTI + RustDesk
    steps.push({ icon: Headphones, title: 'Klient zgłasza problem', desc: 'Zgłoszenie trafia do systemu i jest przypisane do technika.' });
    steps.push({ icon: Monitor, title: 'Technik łączy się zdalnie', desc: 'Sesja RustDesk uruchamia się jednym kliknięciem.' });
    steps.push({ icon: Zap, title: 'Sesja zostaje uruchomiona', desc: 'Czas pracy nalicza się automatycznie w tle.' });
    steps.push({ icon: Settings2, title: 'Technik rozwiązuje problem', desc: 'Pełny dostęp do urządzenia klienta — bezpiecznie i szybko.' });
    steps.push({ icon: Check, title: 'Sesja zakończona', desc: 'Czas trafia do rozliczenia. Klient dostaje potwierdzenie.' });
    steps.push({ icon: FileText, title: 'Faktura na koniec miesiąca', desc: 'Automatyczne zestawienie godzin → gotowa faktura dla klienta.' });
  } else if (hasInfra && infraCfg.mode === 'multi') {
    // MULTI bez RustDesk
    steps.push({ icon: Users, title: 'Wybierasz klienta', desc: 'Panel z listą Twoich firm i ich środowiskiem IT.' });
    steps.push({ icon: Monitor, title: 'Widzisz wszystkie urządzenia', desc: 'Komputery, serwery, drukarki — wszystko w jednym miejscu.' });
    steps.push({ icon: Globe, title: 'Łączysz się zdalnie', desc: 'Uruchamiasz połączenie przez TeamViewer, AnyDesk lub inny klient.' });
    steps.push({ icon: Settings2, title: 'Pracujesz nad problemem', desc: 'Dane klienta, historia zgłoszeń, notatki — masz je pod ręką.' });
    steps.push({ icon: Sparkles, title: 'Wszystko w jednym miejscu', desc: 'Automatyczne rozliczanie czasu dostępne z integracją RustDesk.' });
  } else if (hasInfra) {
    // SOLO
    steps.push({ icon: Monitor, title: 'Wszystkie stanowiska w panelu', desc: 'Jedno miejsce do zarządzania całą infrastrukturą IT firmy.' });
    steps.push({ icon: Settings2, title: 'Wybierasz urządzenie', desc: 'Klikasz w komputer, serwer lub drukarkę.' });
    steps.push({ icon: Globe, title: 'Łączysz się zdalnie', desc: 'Szybkie połączenie z dowolnym stanowiskiem.' });
    steps.push({ icon: Check, title: 'Zarządzasz z jednego miejsca', desc: 'Monitoring, inwentaryzacja, zgłoszenia — wszystko pod kontrolą.' });
  }

  if (hasSales && hasPacking) {
    steps.push({ icon: ShoppingCart, title: 'Nowe zamówienie z platformy', desc: 'Allegro, WooCommerce, Shopify — zamówienie wpada automatycznie przez API.' });
    steps.push({ icon: Package, title: 'Kompletacja rozpoczęta', desc: 'Pracownik skanuje produkty wg listy zamówienia.' });
    steps.push({ icon: Scan, title: 'Weryfikacja przez skan', desc: 'System sprawdza czy wszystko się zgadza. Bez błędów.' });
    steps.push({ icon: FileText, title: 'Faktura lub paragon', desc: 'Dokument generuje się automatycznie.' });
    steps.push({ icon: Car, title: 'List przewozowy gotowy', desc: 'Zamówienie spakowane, etykieta wydrukowana, gotowe do wysyłki.' });
  } else if (hasSales) {
    steps.push({ icon: FileText, title: 'Dane trafiają do systemu', desc: 'Kontrahenci, towary, ceny — baza danych gotowa.' });
    steps.push({ icon: FileText, title: 'Tworzysz dokument', desc: 'Faktura, paragon lub inny dokument sprzedaży w kilka kliknięć.' });
    steps.push({ icon: Users, title: 'Zarządzasz kontrahentami', desc: 'Historia współpracy, płatności, dokumenty — przejrzyście.' });
  } else if (hasPacking) {
    steps.push({ icon: ShoppingCart, title: 'Zamówienie w systemie', desc: 'Nowe zamówienie trafia na listę do realizacji.' });
    steps.push({ icon: Package, title: 'Kompletacja i pakowanie', desc: 'Skanowanie produktów, weryfikacja, pakowanie.' });
    steps.push({ icon: Car, title: 'Wysyłka', desc: 'Etykieta, list przewozowy, status — automatycznie.' });
  }

  if (hasDiag) {
    steps.push({ icon: Calendar, title: 'Nowy termin przeglądu', desc: 'Klient rezerwuje termin online lub przez telefon.' });
    steps.push({ icon: Car, title: 'Przegląd pojazdu', desc: 'Technik przeprowadza inspekcję wg procedury SKP.' });
    steps.push({ icon: FileText, title: 'Dokumentacja gotowa', desc: 'Wynik przeglądu, zdjęcia, uwagi — wszystko w systemie.' });
    steps.push({ icon: Check, title: 'Przypomnienie o następnym', desc: 'System wysyła automatyczne przypomnienie przed terminem.' });
  }

  return steps;
}

// ── Scenario Modal ──
function ScenarioModal({ open, steps, onClose }: { open: boolean; steps: ScenarioStep[]; onClose: () => void }) {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [stepKey, setStepKey] = useState(0); // force re-animate
  const ease = 'cubic-bezier(0.16,1,0.3,1)';

  useEffect(() => { if (open) { setCurrent(0); setStepKey(0); setAutoplay(true); } }, [open]);

  // Autoplay
  useEffect(() => {
    if (!open || !autoplay || current >= steps.length) return;
    const t = setTimeout(() => {
      if (current < steps.length - 1) { setCurrent(c => c + 1); setStepKey(k => k + 1); }
      else setAutoplay(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [open, autoplay, current, steps.length]);

  // Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open || steps.length === 0) return null;

  const isLast = current >= steps.length - 1;
  const finished = isLast && !autoplay;
  const step = steps[current];
  const StepIcon = step?.icon;
  const progress = ((current + 1) / steps.length) * 100;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'cfgFadeIn 0.2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 700, background: 'var(--bg-card)', borderRadius: 28, overflow: 'hidden',
        boxShadow: '0 30px 100px rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.12)',
        animation: 'cfgModalIn 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, #4F46E5, #7C3AED)', width: `${progress}%`, transition: `width 0.5s ${ease}`, borderRadius: 2 }} />
        </div>

        <div style={{ padding: '40px 44px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 850, color: 'var(--t)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                {finished ? 'Twój system jest gotowy' : 'Zobacz, jak działa Twój system'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ts)' }}>
                {finished ? 'Wszystkie procesy zautomatyzowane i gotowe do pracy.' : `Krok ${current + 1} z ${steps.length} — na podstawie Twojej konfiguracji`}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
              <X size={16} color="var(--ts)" />
            </button>
          </div>

          {finished ? (
            /* ── Final screen ── */
            <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 10px 30px rgba(79,70,229,0.35)' }}>
                <Check size={40} color="#fff" strokeWidth={2.5} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>
                {steps.length} kroków — w pełni automatycznie
              </div>
              <div style={{ fontSize: 15, color: 'var(--ts)', marginBottom: 36 }}>
                System robi to za Ciebie. Codziennie, bezbłędnie, bez wysiłku.
              </div>
              <a href="/register" style={{
                padding: '18px 48px', borderRadius: 16, border: 'none', textDecoration: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
                fontSize: 16, fontWeight: 750, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
                boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
                transition: `all 0.25s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.35)'; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; }}
              >
                Rozpocznij za darmo <span style={{ opacity: 0.6 }}>(14 dni)</span> <ArrowRight size={18} />
              </a>
            </div>
          ) : (
            /* ── Step display ── */
            <>
              {/* Timeline dots */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 32, flexWrap: 'wrap' }}>
                {steps.map((_, i) => (
                  <div key={i} onClick={() => { setCurrent(i); setStepKey(k => k + 1); setAutoplay(false); }} style={{
                    width: i === current ? 32 : 10, height: 10, borderRadius: 5, cursor: 'pointer',
                    background: i < current ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : i === current ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)'),
                    transition: `all 0.3s ${ease}`,
                    opacity: i <= current ? 1 : 0.5,
                  }} />
                ))}
              </div>

              {/* Current step card */}
              <div key={stepKey} style={{
                padding: 36, borderRadius: 20, minHeight: 180,
                background: isLight ? 'linear-gradient(160deg, #F8FAFC, #EEF2FF, #F5F3FF)' : 'rgba(79,70,229,0.06)',
                border: '1px solid rgba(99,102,241,0.1)',
                animation: 'cfgStepIn 0.5s cubic-bezier(0.16,1,0.3,1)',
                display: 'flex', alignItems: 'center', gap: 28,
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20, flexShrink: 0,
                  background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(79,70,229,0.3)',
                }}>
                  {StepIcon && <StepIcon size={32} color="#fff" strokeWidth={1.7} />}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#818CF8', marginBottom: 8 }}>Krok {current + 1}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', marginBottom: 8, letterSpacing: '-0.02em' }}>{step.title}</div>
                  <div style={{ fontSize: 15, color: 'var(--ts)', lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
                <button onClick={() => { if (current > 0) { setCurrent(c => c - 1); setStepKey(k => k + 1); setAutoplay(false); } }} disabled={current === 0} style={{
                  padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: current === 0 ? 'var(--td)' : 'var(--ts)', fontSize: 14, fontWeight: 650, cursor: current === 0 ? 'default' : 'pointer',
                  transition: `all 0.2s ease`, opacity: current === 0 ? 0.5 : 1,
                }}>Wstecz</button>

                <button onClick={() => { setAutoplay(!autoplay); }} style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: autoplay ? 'rgba(79,70,229,0.06)' : 'var(--bg-card)',
                  color: 'var(--ts)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
                }}>
                  {autoplay ? 'Pauza' : 'Autoplay'}
                </button>

                <button onClick={() => { if (current < steps.length - 1) { setCurrent(c => c + 1); setStepKey(k => k + 1); setAutoplay(false); } else { setAutoplay(false); } }} style={{
                  padding: '12px 24px', borderRadius: 12, border: 'none',
                  background: isLast ? 'linear-gradient(135deg, #059669, #10B981)' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(79,70,229,0.3)', transition: `all 0.25s ${ease}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {isLast ? 'Zakończ' : 'Dalej'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Component ──
export default function ConfiguratorPage() {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set(['onboarding']));
  const [pricePulse, setPricePulse] = useState(false);
  const [flashItems, setFlashItems] = useState<Set<number>>(new Set());

  // Infra modal state
  const [infraModal, setInfraModal] = useState(false);
  const [infraConfig, setInfraConfig] = useState<InfraConfig>(defaultInfraConfig);
  // Integration modal state (sales/packing)
  // Auto-include infra state
  const [infraAutoIncluded, setInfraAutoIncluded] = useState(false);
  const [infraManuallyDisabled, setInfraManuallyDisabled] = useState(false);
  // Confirm dialog for disabling IT
  const [showInfraConfirm, setShowInfraConfirm] = useState(false);
  // Billing cycle
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const isYearly = billingCycle === 'yearly';
  // Scenario modal
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const scenarioSteps = useMemo(() => generateScenario(activeModules, infraConfig), [activeModules, infraConfig]);

  // Check if any non-infra module is active and auto-include infra
  const checkAutoIncludeInfra = useCallback((modules: Set<string>) => {
    const hasNonInfra = Array.from(modules).some(id => id !== 'infra');
    if (hasNonInfra && !modules.has('infra')) {
      const next = new Set(modules);
      next.add('infra');
      setActiveModules(next);
      setInfraConfig(defaultInfraConfig);
      setInfraAutoIncluded(true);
    }
  }, []);

  const toggleModule = (id: string) => {
    if (id === 'infra') {
      if (activeModules.has('infra')) {
        // Show confirmation before deactivating
        setShowInfraConfirm(true);
        return;
      } else {
        // Open modal to configure
        setInfraModal(true);
        setInfraManuallyDisabled(false);
      }
      triggerPricePulse();
      return;
    }
    // Other modules (sales, packing, diagnostic, etc.)
    const next = new Set(activeModules);
    next.has(id) ? next.delete(id) : next.add(id);
    setActiveModules(next);
    // Auto-include infra check
    if (!next.has(id)) {
      // just removed — no need to auto-include
    } else {
      setTimeout(() => checkAutoIncludeInfra(next), 0);
    }
    triggerPricePulse();
  };

  // After every activeModules change, check auto-include / auto-remove
  useEffect(() => {
    const hasNonInfra = Array.from(activeModules).some(id => id !== 'infra');
    // Auto-include only if user hasn't manually disabled it
    if (hasNonInfra && !activeModules.has('infra') && !infraManuallyDisabled) {
      checkAutoIncludeInfra(activeModules);
    }
    // Auto-remove infra if it was auto-included and no other modules left
    if (!hasNonInfra && activeModules.has('infra') && infraAutoIncluded) {
      setActiveModules(prev => { const n = new Set(prev); n.delete('infra'); return n; });
      setInfraConfig(defaultInfraConfig);
      setInfraAutoIncluded(false);
      setInfraManuallyDisabled(false);
    }
    // Reset manually disabled flag when all non-infra modules removed
    if (!hasNonInfra) setInfraManuallyDisabled(false);
  }, [activeModules, checkAutoIncludeInfra, infraAutoIncluded, infraManuallyDisabled]);

  const toggleAddon = (id: string) => {
    setActiveAddons(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    triggerPricePulse();
  };

  const triggerPricePulse = useCallback(() => {
    setPricePulse(true);
    setTimeout(() => setPricePulse(false), 500);
  }, []);

  const handleInfraApply = useCallback((cfg: InfraConfig) => {
    setInfraConfig(cfg);
    setActiveModules(prev => { const n = new Set(prev); n.add('infra'); return n; });
    setInfraModal(false);
    setInfraAutoIncluded(false); // User manually configured
    triggerPricePulse();
  }, [triggerPricePulse]);

  const infraPrice = useMemo(() => calcInfraPrice(infraConfig), [infraConfig]);

  const pricing = useMemo(() => {
    let monthly = 0;
    const items: { name: string; price: number; sub?: string }[] = [];
    activeModules.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId); if (!mod) return;
      if (modId === 'infra') {
        if (infraAutoIncluded && isDefaultInfraConfig(infraConfig)) {
          items.push({ name: 'Zarządzanie IT (gratis)', price: 0, sub: '1 stanowisko' });
        } else {
          items.push({ name: `Zarządzanie IT (${infraConfig.mode.toUpperCase()})`, price: infraPrice.total, sub: infraSummary(infraConfig) });
          monthly += infraPrice.total;
        }
      } else {
        items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom;
      }
    });
    activeAddons.forEach(id => { const a = ADDONS.find(a => a.id === id); if (a?.price) { items.push({ name: a.name, price: a.price }); monthly += a.price; } });
    return { items, monthly };
  }, [activeModules, activeAddons, infraConfig, infraPrice, infraAutoIncluded]);

  // Flash new items in pricing list
  const prevItemCount = useRef(pricing.items.length);
  useEffect(() => {
    if (pricing.items.length > prevItemCount.current) {
      const newSet = new Set<number>();
      for (let i = prevItemCount.current; i < pricing.items.length; i++) newSet.add(i);
      setFlashItems(newSet);
      setTimeout(() => setFlashItems(new Set()), 600);
    }
    prevItemCount.current = pricing.items.length;
  }, [pricing.items.length]);

  const ease = 'cubic-bezier(0.16,1,0.3,1)';
  const easeOut = 'cubic-bezier(0.4,0,0.2,1)';

  const [clickedModule, setClickedModule] = useState<string | null>(null);
  const handleModuleClick = (id: string) => {
    setClickedModule(id);
    setTimeout(() => setClickedModule(null), 350);
    toggleModule(id);
  };

  // Render a module card
  const renderModuleCard = (mod: ModuleDef, modIdx: number) => {
    const active = activeModules.has(mod.id);
    const clicked = clickedModule === mod.id;
    const Icon = mod.icon;
    const isInfra = mod.id === 'infra';
    const isSales = mod.id === 'sales';
    // Compute display price
    let displayPrice: number;
    let priceLabel: string;
    if (isInfra && active && infraAutoIncluded && isDefaultInfraConfig(infraConfig)) {
      displayPrice = 0;
      priceLabel = '0 zł';
    } else if (isInfra && active) {
      displayPrice = infraPrice.total;
      priceLabel = `${displayPrice} zł`;
    } else if (isInfra && !active) {
      displayPrice = mod.priceFrom;
      priceLabel = 'od 0 zł';
    } else {
      displayPrice = mod.priceFrom;
      priceLabel = `${displayPrice} zł`;
    }

    // Card click handler
    const onCardClick = () => {
      if (isInfra) {
        if (active) {
          setInfraModal(true);
          setInfraAutoIncluded(false);
        } else {
          handleModuleClick(mod.id);
        }
      } else {
        handleModuleClick(mod.id);
      }
    };

    // Toggle click handler
    const onToggleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleModuleClick(mod.id);
    };

    // Determine if infra toggle should be disabled (auto-included)
    const infraToggleDisabled = false; // always allow toggle

    return (
      <FadeInSection key={mod.id} delay={modIdx * 80}>
        <div onClick={onCardClick} style={{
          padding: 32, borderRadius: 22, cursor: 'pointer', minHeight: 320,
          display: 'flex', flexDirection: 'column' as const,
          background: active ? (isLight ? 'linear-gradient(160deg, #EEF2FF 0%, #F5F3FF 50%, #fff 100%)' : 'rgba(79,70,229,0.08)') : 'var(--bg-card)',
          border: `2px solid ${active ? '#818CF8' : 'var(--border)'}`,
          boxShadow: active
            ? '0 0 0 4px rgba(99,102,241,0.1), 0 12px 32px rgba(79,70,229,0.12), 0 2px 4px rgba(79,70,229,0.06)'
            : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)',
          transition: `all 0.35s ${ease}`,
          transform: clicked ? 'scale(1.03)' : active ? 'scale(1.02)' : 'scale(1)',
        }}
          onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.07), 0 4px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(-3px)'; } }}
          onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'scale(1)'; } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' : 'rgba(255,255,255,0.06)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: `all 0.35s ${ease}`,
                boxShadow: active ? '0 6px 16px rgba(79,70,229,0.35)' : '0 1px 3px rgba(0,0,0,0.06)',
                transform: clicked ? 'rotate(-8deg) scale(1.1)' : 'rotate(0deg) scale(1)',
              }}>
                <Icon size={26} color={active ? '#fff' : 'var(--ts)'} strokeWidth={1.7} />
              </div>
              {/* GRATIS badge for auto-included infra */}
              {isInfra && active && infraAutoIncluded && isDefaultInfraConfig(infraConfig) && (
                <div style={{
                  position: 'absolute', top: -8, right: -32,
                  padding: '2px 10px', borderRadius: 8,
                  background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', color: '#059669',
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                  boxShadow: '0 1px 4px rgba(16,185,129,0.2)',
                }}>GRATIS</div>
              )}
            </div>
            {/* Toggle */}
            <div onClick={infraToggleDisabled ? undefined : onToggleClick} style={{
              width: 44, height: 26, borderRadius: 13, padding: 2, cursor: infraToggleDisabled ? 'default' : 'pointer',
              background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)'),
              transition: `all 0.35s ${ease}`,
              boxShadow: active ? '0 2px 8px rgba(79,70,229,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
              opacity: infraToggleDisabled ? 0.6 : 1,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11, background: '#fff',
                transform: active ? 'translateX(18px)' : 'translateX(0)',
                transition: `transform 0.35s ${ease}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.06)',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isInfra && active ? 8 : 14 }}>
            <span style={{ fontSize: 18, fontWeight: 750, color: 'var(--t)', letterSpacing: '-0.02em' }}>{mod.name}</span>
          </div>

          {/* Infra active + auto-included: show gratis info */}
          {isInfra && active && infraAutoIncluded && isDefaultInfraConfig(infraConfig) ? (
            <div>
              <div style={{ fontSize: 14, color: '#059669', fontWeight: 600, marginBottom: 16 }}>1 stanowisko gratis</div>
              <button onClick={e => { e.stopPropagation(); setInfraModal(true); setInfraAutoIncluded(false); }} style={{
                padding: '10px 20px', borderRadius: 12, border: '1px solid #C7D2FE', background: 'rgba(79,70,229,0.04)',
                color: '#4F46E5', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                transition: `all 0.2s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,70,229,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,70,229,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <Settings2 size={14} /> Zmień konfigurację
              </button>
            </div>
          ) : isInfra && active ? (
            /* Infra active: show summary + change button instead of features */
            <div>
              <div style={{ fontSize: 14, color: 'var(--ts)', marginBottom: 16 }}>{infraSummary(infraConfig)}</div>
              <button onClick={e => { e.stopPropagation(); setInfraModal(true); }} style={{
                padding: '10px 20px', borderRadius: 12, border: '1px solid #C7D2FE', background: 'rgba(79,70,229,0.04)',
                color: '#4F46E5', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                transition: `all 0.2s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,70,229,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,70,229,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <Settings2 size={14} /> Zmień konfigurację
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {mod.features.map((f, fi) => (
                <div key={f} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
                  opacity: active ? 1 : 0.7,
                  transition: `opacity 0.3s ${easeOut} ${fi * 40}ms`,
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: active ? 'rgba(79,70,229,0.1)' : (isLight ? '#F1F5F9' : 'rgba(255,255,255,0.04)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: `all 0.25s ${easeOut} ${fi * 40}ms` }}>
                    <Check size={11} color={active ? '#4F46E5' : 'var(--tm)'} strokeWidth={2.5} />
                  </div>
                  <span style={{ fontSize: 14, color: active ? 'var(--t)' : 'var(--ts)', fontWeight: 450, transition: `color 0.2s ${easeOut}` }}>{f}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ paddingTop: 16, marginTop: 'auto', borderTop: `1px solid ${active ? 'rgba(99,102,241,0.12)' : 'var(--border)'}`, transition: `border-color 0.3s ${easeOut}` }}>
            <span style={{ fontSize: 26, fontWeight: 850, color: active ? '#4F46E5' : 'var(--t)', letterSpacing: '-0.03em', transition: `color 0.25s ${easeOut}` }}>{priceLabel}</span>
            <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--tm)', marginLeft: 4 }}>/ miesiąc</span>
          </div>
        </div>
      </FadeInSection>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", scrollBehavior: 'smooth' }}>

      {/* Modals */}
      <InfraModal open={infraModal} initial={infraConfig} onApply={handleInfraApply} onCancel={() => setInfraModal(false)} />
      <ScenarioModal open={scenarioOpen} steps={scenarioSteps} onClose={() => setScenarioOpen(false)} />

      {/* Confirm disable IT */}
      {showInfraConfirm && (
        <div onClick={() => setShowInfraConfirm(false)} style={{
          position: 'fixed', inset: 0, zIndex: 250,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'cfgFadeIn 0.2s ease',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 440, background: 'var(--bg-card)', borderRadius: 22, padding: '32px 36px',
            boxShadow: '0 25px 80px rgba(0,0,0,0.2)', animation: 'cfgModalIn 0.3s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #F59E0B, #EAB308)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Monitor size={22} color="#fff" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)' }}>Wyłączyć Zarządzanie IT?</div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--ts)', lineHeight: 1.7, marginBottom: 24 }}>
              Dzięki temu modułowi możemy połączyć się zdalnie z Twoim środowiskiem i udzielać wsparcia technicznego w ramach współpracy.<br /><br />
              <span style={{ fontWeight: 600, color: 'var(--t)' }}>Czy na pewno chcesz wyłączyć ten moduł?</span>
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowInfraConfirm(false)} style={{
                flex: 1, padding: '14px 20px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(79,70,229,0.3)', transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >Zostaw włączony</button>
              <button onClick={() => {
                setActiveModules(prev => { const n = new Set(prev); n.delete('infra'); return n; });
                setInfraConfig(defaultInfraConfig);
                setInfraAutoIncluded(false);
                setInfraManuallyDisabled(true);
                setShowInfraConfirm(false);
                triggerPricePulse();
              }} style={{
                padding: '14px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--ts)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#F8FAFC' : 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >Tak, wyłącz</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AMBIENT GLOW ── */}
      <div style={{ position: 'fixed', top: -200, left: '30%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, rgba(79,70,229,${isLight ? '0.04' : '0.06'}) 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 200, right: '-10%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, rgba(124,58,237,${isLight ? '0.03' : '0.05'}) 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: -100, left: '10%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, rgba(16,185,129,${isLight ? '0.025' : '0.04'}) 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

      {/* ── TOP BAR ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: isLight ? 'rgba(248,250,252,0.72)' : 'rgba(10,15,30,0.7)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: '1px solid var(--border)', transition: 'box-shadow 0.3s ease' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 44, objectFit: 'contain' }} />
          </div>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ts)', textDecoration: 'none', transition: `all 0.2s ${easeOut}` }}
            onMouseEnter={e => { e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.transform = 'translateX(0)'; }}>
            Masz konto? <span style={{ fontWeight: 600 }}>Zaloguj się →</span>
          </Link>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', display: 'flex', gap: 56, position: 'relative', zIndex: 1 }}>
        <main style={{ flex: '1 1 0', minWidth: 0, paddingBottom: 120 }}>

          {/* ── HERO ── */}
          <FadeInSection>
            <section style={{ padding: '72px 0 60px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 18px', borderRadius: 24, marginBottom: 28,
                background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', color: '#059669',
                fontSize: 13, fontWeight: 700, letterSpacing: '0.01em',
                boxShadow: '0 1px 6px rgba(16,185,129,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,0.6)', animation: 'cfgPulse 2s ease-in-out infinite' }} />
                14 dni za darmo — bez karty
              </div>
              <h1 style={{ fontSize: 48, fontWeight: 850, color: 'var(--t)', letterSpacing: '-0.04em', lineHeight: 1.08, margin: '0 0 20px' }}>
                Zbuduj system dla swojej<br />firmy w 5 minut
              </h1>
              <p style={{ fontSize: 20, color: 'var(--ts)', lineHeight: 1.6, maxWidth: 540, margin: 0, fontWeight: 400 }}>
                Wybierz moduły, połącz z używanymi systemami<br />i zacznij bez ryzyka.
              </p>
            </section>
          </FadeInSection>

          {/* ── MODULES ── */}
          <FadeInSection delay={100}>
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                <Sparkles size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--tm)', margin: 0 }}>Wybierz moduły</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                {MODULES.map((mod, i) => renderModuleCard(mod, i))}
              </div>
            </section>
          </FadeInSection>

          {/* ── ADDONS ── */}
          <FadeInSection delay={200}>
            <section style={{ marginTop: 64 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                <Zap size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--tm)', margin: 0 }}>Dodatkowe opcje</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {ADDONS.map((addon, ai) => {
                  const active = activeAddons.has(addon.id);
                  const Icon = addon.icon;
                  return (
                    <FadeInSection key={addon.id} delay={ai * 80}>
                      <div onClick={() => toggleAddon(addon.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18, cursor: 'pointer',
                        background: active ? (isLight ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF, #fff)' : 'rgba(79,70,229,0.08)') : 'var(--bg-card)',
                        border: `2px solid ${active ? '#818CF8' : 'var(--border)'}`,
                        boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.08), 0 8px 20px rgba(79,70,229,0.08)' : '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)',
                        transition: `all 0.3s ${ease}`,
                      }}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = active ? '#818CF8' : ''; e.currentTarget.style.transform = 'translateY(0)'; if (!active) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)'; }}
                      >
                        <div style={{
                          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' : 'rgba(255,255,255,0.06)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: active ? '0 6px 16px rgba(79,70,229,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                          transition: `all 0.3s ${ease}`,
                        }}>
                          <Icon size={24} color={active ? '#fff' : 'var(--ts)'} strokeWidth={1.7} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontSize: 17, fontWeight: 750, color: 'var(--t)' }}>{addon.name}</span>
                            {addon.badge && <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 12, background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', color: '#059669', letterSpacing: '0.02em', boxShadow: '0 1px 4px rgba(16,185,129,0.1)' }}>{addon.badge}</span>}
                          </div>
                          <div style={{ fontSize: 14, color: 'var(--ts)', lineHeight: 1.5 }}>{addon.description}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                          {addon.price ? (
                            <div><span style={{ fontSize: 20, fontWeight: 850, color: active ? '#4F46E5' : 'var(--t)', transition: `color 0.25s ${easeOut}` }}>{addon.price} zł</span><span style={{ fontSize: 13, color: 'var(--tm)' }}> / msc</span></div>
                          ) : (
                            <div style={{ fontSize: 15, fontWeight: 750, color: '#059669' }}>Gratis</div>
                          )}
                        </div>
                        <div style={{
                          width: 44, height: 26, borderRadius: 13, padding: 2, flexShrink: 0,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : (isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)'),
                          transition: `all 0.35s ${ease}`,
                          boxShadow: active ? '0 2px 8px rgba(79,70,229,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#fff', transform: active ? 'translateX(18px)' : 'translateX(0)', transition: `transform 0.35s ${ease}`, boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.06)' }} />
                        </div>
                      </div>
                    </FadeInSection>
                  );
                })}
              </div>
            </section>
          </FadeInSection>

          {/* scenario CTA moved to right column */}
        </main>

        {/* ── RIGHT: PRICING BOX ── */}
        <aside style={{ width: 380, flexShrink: 0 }}>
         <div style={{ position: 'sticky', top: 88 }}>
          <div style={{
            padding: 36, borderRadius: 24,
            background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(10,15,30,0.7)', backdropFilter: 'blur(24px) saturate(1.8)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.03)',
            transition: `box-shadow 0.4s ${easeOut}`,
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', marginBottom: 20, letterSpacing: '-0.02em' }}>Twoja konfiguracja</h3>

            {/* Billing cycle toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 3 }}>
              {(['monthly', 'yearly'] as const).map(cycle => {
                const sel = billingCycle === cycle;
                return (
                  <button key={cycle} onClick={() => setBillingCycle(cycle)} style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
                    background: sel ? 'var(--bg-card)' : 'transparent',
                    color: sel ? 'var(--t)' : 'var(--ts)',
                    fontSize: 13, fontWeight: sel ? 700 : 500, cursor: 'pointer',
                    boxShadow: sel ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    transition: `all 0.25s ${ease}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {cycle === 'monthly' ? 'Miesięcznie' : <>Rocznie <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: sel ? 'linear-gradient(135deg, #ECFDF5, #D1FAE5)' : 'rgba(16,185,129,0.1)', color: '#059669' }}>-10%</span></>}
                  </button>
                );
              })}
            </div>
            {isYearly && <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, marginTop: -12, textAlign: 'center' }}>Większość firm wybiera rozliczenie roczne</div>}

            {pricing.items.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', animation: `cfgFadeIn 0.4s ${ease}` }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: isLight ? 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Package size={26} color="#94A3B8" />
                </div>
                <div style={{ fontSize: 15, color: 'var(--tm)', fontWeight: 500 }}>Wybierz moduły,<br />aby zobaczyć wycenę</div>
              </div>
            ) : (
              <div style={{ marginBottom: 28 }}>
                {pricing.items.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 8px',
                    borderBottom: '1px solid var(--border)',
                    animation: `cfgSlideUp 0.35s ${ease} ${i * 50}ms both`,
                    background: flashItems.has(i) ? 'rgba(79,70,229,0.04)' : 'transparent',
                    transition: 'background 0.4s ease', borderRadius: 8, marginLeft: -8, marginRight: -8,
                  }}>
                    <div>
                      <span style={{ fontSize: 14, color: 'var(--t)', fontWeight: 500, display: 'block' }}>{item.name}</span>
                      {item.sub && <span style={{ fontSize: 12, color: 'var(--tm)', fontWeight: 450, display: 'block', marginTop: 2 }}>{item.sub}</span>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 750, color: 'var(--t)', fontVariantNumeric: 'tabular-nums' }}>{item.price} zł</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price */}
            {(() => {
              const m = pricing.monthly;
              const yearlyBase = m * 12;
              const yearlyDisc = Math.round(yearlyBase * 0.9);
              const yearlySave = yearlyBase - yearlyDisc;
              const yearlyMonthEq = Math.round(yearlyDisc / 12);
              return (
                <div style={{
                  borderRadius: 18, padding: 28, marginBottom: 12, position: 'relative', overflow: 'hidden',
                  background: 'linear-gradient(145deg, #F0FDF4 0%, #ECFDF5 50%, #D1FAE5 100%)',
                  border: '1px solid rgba(16,185,129,0.12)',
                  boxShadow: pricePulse ? '0 0 0 3px rgba(16,185,129,0.15), inset 0 1px 0 rgba(255,255,255,0.6)' : 'inset 0 1px 0 rgba(255,255,255,0.6)',
                  transition: 'box-shadow 0.4s ease',
                }}>
                  <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', filter: 'blur(20px)', pointerEvents: 'none' }} />
                  {/* Today = 0 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, position: 'relative' }}>
                    <span style={{ fontSize: 15, fontWeight: 650, color: '#064E3B' }}>Dziś płacisz:</span>
                    <span style={{ fontSize: 42, fontWeight: 900, color: '#059669', letterSpacing: '-0.05em', lineHeight: 1, textShadow: '0 2px 8px rgba(16,185,129,0.15)', transform: pricePulse ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-block' }}>0 zł</span>
                  </div>
                  <div style={{ height: 1, background: 'rgba(16,185,129,0.12)', margin: '0 0 12px' }} />
                  {/* After trial */}
                  {isYearly ? (
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#064E3B' }}>Po 14 dniach:</span>
                        <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--t)', fontVariantNumeric: 'tabular-nums', transform: pricePulse ? 'scale(1.06)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-block' }}>
                          <AnimatedPrice value={yearlyMonthEq} /> zł<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--tm)' }}> / msc</span>
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ts)', marginBottom: 8 }}>
                        przy płatności rocznej
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#064E3B', fontWeight: 500 }}>Razem za rok:</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 18, fontWeight: 850, color: 'var(--t)', fontVariantNumeric: 'tabular-nums' }}><AnimatedPrice value={yearlyDisc} /> zł</span>
                        </div>
                      </div>
                      {m > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--tm)' }}>Bez rabatu:</span>
                          <span style={{ fontSize: 13, color: 'var(--tm)', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>{yearlyBase} zł</span>
                        </div>
                      )}
                      {yearlySave > 0 && (
                        <div style={{ marginTop: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, animation: 'cfgFadeIn 0.3s ease' }}>
                          <Check size={13} color="#059669" strokeWidth={3} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>Oszczędzasz {yearlySave} zł rocznie</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', position: 'relative' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#064E3B' }}>Po 14 dniach:</span>
                      <span style={{ fontSize: 22, fontWeight: 850, color: 'var(--t)', fontVariantNumeric: 'tabular-nums', transform: pricePulse ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-block' }}>
                        <AnimatedPrice value={m} /> zł <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--tm)' }}>/ msc</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: 'var(--tm)', fontWeight: 500 }}>Wszystkie ceny netto</span>
            </div>

            {/* CTA */}
            <Link to="/register" className="cfg-cta-btn" style={{
              width: '100%', padding: '18px 20px', borderRadius: 16, border: 'none', textDecoration: 'none',
              background: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)',
              color: '#fff', fontSize: 16, fontWeight: 750, cursor: 'pointer', letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 6px 20px rgba(79,70,229,0.35), 0 2px 4px rgba(79,70,229,0.15)',
              transition: `all 0.25s ${ease}`,
              opacity: pricing.items.length > 0 ? 1 : 0.55,
              position: 'relative', overflow: 'hidden',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.4), 0 4px 8px rgba(79,70,229,0.15), 0 0 40px rgba(99,102,241,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.35), 0 2px 4px rgba(79,70,229,0.15)'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px) scale(0.97)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.3)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.4), 0 4px 8px rgba(79,70,229,0.15), 0 0 40px rgba(99,102,241,0.15)'; }}
            >
              {isYearly ? 'Rozpocznij za darmo i oszczędź 10%' : 'Rozpocznij za darmo'} {!isYearly && <span style={{ opacity: 0.65, fontWeight: 500 }}>(14 dni)</span>} <ArrowRight size={18} />
            </Link>

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--tm)', marginTop: 12, fontWeight: 450, lineHeight: 1.5 }}>
              Możesz zacząć za darmo i skonfigurować wszystko z nami bezpłatnie.
            </p>

            <button style={{
              width: '100%', padding: '15px 20px', borderRadius: 16, marginTop: 12,
              border: '1px solid var(--border)', background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)',
              color: 'var(--t)', fontSize: 14, fontWeight: 650, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: `all 0.25s ${ease}`, backdropFilter: 'blur(8px)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.background = isLight ? 'linear-gradient(135deg, #F5F3FF, #EEF2FF)' : 'rgba(79,70,229,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            >
              <MessageCircle size={16} /> Porozmawiaj z nami
            </button>

            {/* Trust */}
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Bez karty kredytowej', 'Bez umowy i zobowiązań', 'Możesz zrezygnować w każdej chwili', 'Pełny dostęp przez 14 dni'].map((t, ti) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0, animation: `cfgFadeIn 0.4s ${ease} ${600 + ti * 80}ms both` }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} color="#059669" strokeWidth={3} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--ts)', fontWeight: 475 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SCENARIO CTA (below pricing box) ── */}
          {activeModules.size > 0 && (
            <div style={{
              marginTop: 20, padding: '28px 28px', borderRadius: 20, textAlign: 'center',
              background: isLight ? 'linear-gradient(160deg, #EEF2FF 0%, #F5F3FF 40%, #fff 100%)' : 'rgba(79,70,229,0.06)',
              border: '1px solid rgba(99,102,241,0.1)',
              boxShadow: '0 2px 16px rgba(79,70,229,0.06)',
              animation: `cfgSlideUp 0.4s ${ease}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#818CF8', marginBottom: 8 }}>Podgląd działania</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                Jak to będzie działać?
              </div>
              <div style={{ fontSize: 13, color: 'var(--ts)', marginBottom: 18, lineHeight: 1.5 }}>
                Interaktywny scenariusz na podstawie Twojej konfiguracji.
              </div>
              <button onClick={() => setScenarioOpen(true)} style={{
                width: '100%', padding: '14px 20px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(79,70,229,0.3)',
                transition: `all 0.25s ${ease}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.35)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.3)'; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)'; }}
              >
                <Sparkles size={15} /> Zobacz scenariusz
              </button>
            </div>
          )}
         </div>
        </aside>
      </div>

      <style>{`
        @keyframes cfgSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cfgFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cfgPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.95); } }
        @keyframes cfgModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes cfgStepIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        .cfg-cta-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; border-radius: inherit; }
        .cfg-cta-btn:hover::after { opacity: 1; }
        html { scroll-behavior: smooth; }
        input[type="range"]::-webkit-slider-thumb { cursor: pointer; }
      `}</style>
    </div>
  );
}
