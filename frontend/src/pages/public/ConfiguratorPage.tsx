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

// ── Types ──
interface ModuleDef { id: string; name: string; description: string; icon: React.ElementType; features: string[]; priceFrom: number; hasModal?: boolean; showIntegrations?: boolean; }
interface IntegrationDef { id: string; name: string; icon: string; category: string; }
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

// ── Data ──
const MODULES: ModuleDef[] = [
  { id: 'infra', name: 'Zarządzanie IT', description: 'Pełna kontrola nad środowiskiem IT firmy.', icon: Monitor, features: ['Zarządzanie komputerami', 'Użytkownicy i uprawnienia', 'Monitoring sieci', 'Obsługa środowiska IT'], priceFrom: 0, hasModal: true },
  { id: 'sales', name: 'Sprzedaż', description: 'Faktury, paragony i dokumenty handlowe.', icon: FileText, features: ['Faktury sprzedaży i zakupu', 'Paragony', 'Kartoteka towarów', 'Kontrahenci i dokumenty'], priceFrom: 59, showIntegrations: true },
  { id: 'packing', name: 'Pakowanie', description: 'Sprawny fulfillment zamówień.', icon: Package, features: ['Kompletacja zamówień', 'Skanowanie produktów', 'Statusy pakowania', 'Obsługa wysyłek'], priceFrom: 79, showIntegrations: true },
  { id: 'diagnostic', name: 'Stacje diagnostyczne', description: 'Moduł branżowy dla SKP i motoryzacji.', icon: Car, features: ['Zarządzanie terminami', 'Przypomnienia klientów', 'Procesy stacji', 'Dokumentacja przeglądów'], priceFrom: 99 },
];
const INTEGRATIONS: IntegrationDef[] = [
  { id: 'allegro', name: 'Allegro', icon: '🛒', category: 'Marketplace' },
  { id: 'woocommerce', name: 'WooCommerce', icon: '🟣', category: 'E-commerce' },
  { id: 'shopify', name: 'Shopify', icon: '🟢', category: 'E-commerce' },
  { id: 'baselinker', name: 'Baselinker', icon: '🔗', category: 'Multi-channel' },
  { id: 'custom-api', name: 'Własne API', icon: '⚡', category: 'Custom' },
  { id: 'more', name: 'I wiele więcej...', icon: '🌐', category: 'Other' },
];
const ADDONS: AddonDef[] = [
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
  const ease = 'cubic-bezier(0.16,1,0.3,1)';
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 750, color: '#4F46E5', fontVariantNumeric: 'tabular-nums' }}>
          {steps[value].label} — {steps[value].price === 0 ? 'w cenie' : `${steps[value].price} zł`}
        </span>
      </div>
      <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
        {/* Track */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, background: '#E2E8F0' }} />
        <div style={{ position: 'absolute', left: 0, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #4F46E5, #7C3AED)', width: `${(value / (steps.length - 1)) * 100}%`, transition: `width 0.25s ${ease}` }} />
        {/* Steps dots */}
        {steps.map((_, i) => (
          <div key={i} onClick={() => onChange(i)} style={{
            position: 'absolute', left: `${(i / (steps.length - 1)) * 100}%`, transform: 'translateX(-50%)',
            width: i === value ? 20 : 10, height: i === value ? 20 : 10, borderRadius: '50%',
            background: i <= value ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#CBD5E1',
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
          <span key={i} style={{ fontSize: 10, color: i === value ? '#4F46E5' : '#94A3B8', fontWeight: i === value ? 700 : 400, transition: `all 0.2s ease`, minWidth: 0, textAlign: 'center' }}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Infra Config Modal ──
function InfraModal({ open, initial, onApply, onCancel }: { open: boolean; initial: InfraConfig; onApply: (cfg: InfraConfig) => void; onCancel: () => void }) {
  const [cfg, setCfg] = useState<InfraConfig>(initial);
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
        background: '#fff', borderRadius: 24, padding: '36px 40px',
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
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>Zarządzanie IT</div>
              <div style={{ fontSize: 13, color: '#64748B' }}>Skonfiguruj moduł pod swoje potrzeby</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `all 0.2s ease` }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
            <X size={16} color="#64748B" />
          </button>
        </div>

        {/* Mode selector */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 14 }}>Tryb</div>
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
                  background: sel ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF)' : '#FAFBFC',
                  border: `2px solid ${sel ? '#818CF8' : '#E2E8F0'}`,
                  boxShadow: sel ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  transition: `all 0.25s ${ease}`,
                  transform: sel ? 'scale(1.01)' : 'scale(1)',
                }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#C7D2FE'; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: sel ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: `all 0.25s ${ease}` }}>
                      <MI size={18} color={sel ? '#fff' : '#94A3B8'} />
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 800, color: sel ? '#4F46E5' : '#0F172A', transition: `color 0.2s ease` }}>{m.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', paddingLeft: 46 }}>{m.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', marginBottom: 20 }}>Konfiguracja</div>
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
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{l.price === 0 ? 'w cenie' : `${l.price} zł`}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, marginTop: 8, borderTop: '2px solid rgba(16,185,129,0.2)' }}>
            <span style={{ fontSize: 16, fontWeight: 750, color: '#064E3B' }}>Razem:</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: '-0.03em' }}>{pricing.total} zł<span style={{ fontSize: 14, fontWeight: 400, color: '#64748B' }}> / msc</span></span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '16px 20px', borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff',
            color: '#64748B', fontSize: 15, fontWeight: 650, cursor: 'pointer', transition: `all 0.2s ${ease}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
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

// ── Component ──
export default function ConfiguratorPage() {
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set(['onboarding']));
  const [pricePulse, setPricePulse] = useState(false);
  const [flashItems, setFlashItems] = useState<Set<number>>(new Set());

  // Infra modal state
  const [infraModal, setInfraModal] = useState(false);
  const [infraConfig, setInfraConfig] = useState<InfraConfig>(defaultInfraConfig);

  const toggleModule = (id: string) => {
    if (id === 'infra') {
      if (activeModules.has('infra')) {
        // Deactivate
        setActiveModules(prev => { const n = new Set(prev); n.delete('infra'); return n; });
        setInfraConfig(defaultInfraConfig);
      } else {
        // Open modal to configure
        setInfraModal(true);
      }
      triggerPricePulse();
      return;
    }
    setActiveModules(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    triggerPricePulse();
  };
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
    triggerPricePulse();
  }, [triggerPricePulse]);

  const infraPrice = useMemo(() => calcInfraPrice(infraConfig), [infraConfig]);

  const pricing = useMemo(() => {
    let monthly = 0; const items: { name: string; price: number }[] = [];
    activeModules.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId); if (!mod) return;
      if (modId === 'infra') {
        items.push({ name: `Zarządzanie IT (${infraConfig.mode.toUpperCase()})`, price: infraPrice.total });
        monthly += infraPrice.total;
      } else {
        items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom;
      }
    });
    activeAddons.forEach(id => { const a = ADDONS.find(a => a.id === id); if (a?.price) { items.push({ name: a.name, price: a.price }); monthly += a.price; } });
    return { items, monthly };
  }, [activeModules, activeAddons, infraConfig, infraPrice]);

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

  const showIntegrations = activeModules.has('sales') || activeModules.has('packing');
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
    const displayPrice = isInfra && active ? infraPrice.total : mod.priceFrom;
    const priceLabel = isInfra && !active ? 'od 0 zł' : `${displayPrice} zł`;

    return (
      <FadeInSection key={mod.id} delay={modIdx * 80}>
        <div onClick={() => { if (!active || !isInfra) handleModuleClick(mod.id); else setInfraModal(true); }} style={{
          padding: 32, borderRadius: 22, cursor: 'pointer',
          background: active ? 'linear-gradient(160deg, #EEF2FF 0%, #F5F3FF 50%, #fff 100%)' : '#fff',
          border: `2px solid ${active ? '#818CF8' : '#E2E8F0'}`,
          boxShadow: active
            ? '0 0 0 4px rgba(99,102,241,0.1), 0 12px 32px rgba(79,70,229,0.12), 0 2px 4px rgba(79,70,229,0.06)'
            : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)',
          transition: `all 0.35s ${ease}`,
          transform: clicked ? 'scale(1.03)' : active ? 'scale(1.02)' : 'scale(1)',
        }}
          onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.07), 0 4px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(-3px)'; } }}
          onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'scale(1)'; } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'linear-gradient(135deg, #F1F5F9, #E2E8F0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `all 0.35s ${ease}`,
              boxShadow: active ? '0 6px 16px rgba(79,70,229,0.35)' : '0 1px 3px rgba(0,0,0,0.06)',
              transform: clicked ? 'rotate(-8deg) scale(1.1)' : 'rotate(0deg) scale(1)',
            }}>
              <Icon size={26} color={active ? '#fff' : '#64748B'} strokeWidth={1.7} />
            </div>
            {/* Toggle */}
            <div onClick={e => { e.stopPropagation(); handleModuleClick(mod.id); }} style={{
              width: 44, height: 26, borderRadius: 13, padding: 2, cursor: 'pointer',
              background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#E2E8F0',
              transition: `all 0.35s ${ease}`,
              boxShadow: active ? '0 2px 8px rgba(79,70,229,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11, background: '#fff',
                transform: active ? 'translateX(18px)' : 'translateX(0)',
                transition: `transform 0.35s ${ease}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.06)',
              }} />
            </div>
          </div>

          <div style={{ fontSize: 18, fontWeight: 750, color: '#0F172A', marginBottom: isInfra && active ? 8 : 14, letterSpacing: '-0.02em' }}>{mod.name}</div>

          {/* Infra active: show summary + change button instead of features */}
          {isInfra && active ? (
            <div>
              <div style={{ fontSize: 14, color: '#64748B', marginBottom: 16 }}>{infraSummary(infraConfig)}</div>
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
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: active ? 'rgba(79,70,229,0.1)' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: `all 0.25s ${easeOut} ${fi * 40}ms` }}>
                    <Check size={11} color={active ? '#4F46E5' : '#94A3B8'} strokeWidth={2.5} />
                  </div>
                  <span style={{ fontSize: 14, color: active ? '#334155' : '#64748B', fontWeight: 450, transition: `color 0.2s ${easeOut}` }}>{f}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ paddingTop: 16, borderTop: `1px solid ${active ? 'rgba(99,102,241,0.12)' : '#F1F5F9'}`, transition: `border-color 0.3s ${easeOut}` }}>
            <span style={{ fontSize: 26, fontWeight: 850, color: active ? '#4F46E5' : '#0F172A', letterSpacing: '-0.03em', transition: `color 0.25s ${easeOut}` }}>{priceLabel}</span>
            <span style={{ fontSize: 15, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>/ miesiąc</span>
          </div>
        </div>
      </FadeInSection>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", scrollBehavior: 'smooth' }}>

      {/* Infra configuration modal */}
      <InfraModal open={infraModal} initial={infraConfig} onApply={handleInfraApply} onCancel={() => setInfraModal(false)} />

      {/* ── AMBIENT GLOW ── */}
      <div style={{ position: 'fixed', top: -200, left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 200, right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.03) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: -100, left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.025) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── TOP BAR ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,250,252,0.72)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'box-shadow 0.3s ease' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-dark.png" alt="InfraDesk" style={{ height: 44, objectFit: 'contain' }} />
          </div>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: '#64748B', textDecoration: 'none', transition: `all 0.2s ${easeOut}` }}
            onMouseEnter={e => { e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.transform = 'translateX(0)'; }}>
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
              <h1 style={{ fontSize: 48, fontWeight: 850, color: '#0F172A', letterSpacing: '-0.04em', lineHeight: 1.08, margin: '0 0 20px' }}>
                Zbuduj system dla swojej<br />firmy w 5 minut
              </h1>
              <p style={{ fontSize: 20, color: '#64748B', lineHeight: 1.6, maxWidth: 540, margin: 0, fontWeight: 400 }}>
                Wybierz moduły, połącz z używanymi systemami<br />i zacznij bez ryzyka.
              </p>
            </section>
          </FadeInSection>

          {/* ── MODULES ── */}
          <FadeInSection delay={100}>
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                <Sparkles size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Wybierz moduły</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                {MODULES.map((mod, i) => renderModuleCard(mod, i))}
              </div>
            </section>
          </FadeInSection>

          {/* ── INTEGRATIONS ── */}
          <ExpandSection open={showIntegrations}>
            <FadeInSection>
              <section style={{ marginTop: 64 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Plug size={16} color="#4F46E5" />
                  <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Integracje</h2>
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 6 }}>Działa z Twoimi systemami</h3>
                <p style={{ fontSize: 16, color: '#64748B', marginBottom: 28 }}>Podłącz sklepy, marketplace i systemy przez API.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {INTEGRATIONS.map((int, ii) => (
                    <div key={int.id} className="cfg-integration" style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderRadius: 16,
                      background: '#fff', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden',
                      transition: `all 0.25s ${ease}`, cursor: 'pointer',
                      animation: `cfgSlideUp 0.4s ${ease} ${ii * 60}ms both`,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.background = 'linear-gradient(135deg, #F5F3FF, #EEF2FF)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                      onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0) scale(0.97)'; }}
                      onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1)'; }}
                    >
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{int.icon}</span>
                      <span style={{ fontSize: 15, fontWeight: 650, color: '#334155' }}>{int.name}</span>
                      <ChevronRight size={14} color="#CBD5E1" style={{ marginLeft: 'auto', transition: `transform 0.2s ${easeOut}` }} className="cfg-int-arrow" />
                    </div>
                  ))}
                </div>
              </section>
            </FadeInSection>
          </ExpandSection>

          {/* ── ADDONS ── */}
          <FadeInSection delay={200}>
            <section style={{ marginTop: 64 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                <Zap size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Dodatkowe opcje</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {ADDONS.map((addon, ai) => {
                  const active = activeAddons.has(addon.id);
                  const Icon = addon.icon;
                  return (
                    <FadeInSection key={addon.id} delay={ai * 80}>
                      <div onClick={() => toggleAddon(addon.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18, cursor: 'pointer',
                        background: active ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF, #fff)' : '#fff',
                        border: `2px solid ${active ? '#818CF8' : '#E2E8F0'}`,
                        boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.08), 0 8px 20px rgba(79,70,229,0.08)' : '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)',
                        transition: `all 0.3s ${ease}`,
                      }}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = active ? '#818CF8' : '#E2E8F0'; e.currentTarget.style.transform = 'translateY(0)'; if (!active) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)'; }}
                      >
                        <div style={{
                          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'linear-gradient(135deg, #F1F5F9, #E2E8F0)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: active ? '0 6px 16px rgba(79,70,229,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                          transition: `all 0.3s ${ease}`,
                        }}>
                          <Icon size={24} color={active ? '#fff' : '#64748B'} strokeWidth={1.7} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontSize: 17, fontWeight: 750, color: '#0F172A' }}>{addon.name}</span>
                            {addon.badge && <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 12, background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', color: '#059669', letterSpacing: '0.02em', boxShadow: '0 1px 4px rgba(16,185,129,0.1)' }}>{addon.badge}</span>}
                          </div>
                          <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>{addon.description}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                          {addon.price ? (
                            <div><span style={{ fontSize: 20, fontWeight: 850, color: active ? '#4F46E5' : '#0F172A', transition: `color 0.25s ${easeOut}` }}>{addon.price} zł</span><span style={{ fontSize: 13, color: '#94A3B8' }}> / msc</span></div>
                          ) : (
                            <div style={{ fontSize: 15, fontWeight: 750, color: '#059669' }}>Gratis</div>
                          )}
                        </div>
                        <div style={{
                          width: 44, height: 26, borderRadius: 13, padding: 2, flexShrink: 0,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#E2E8F0',
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
        </main>

        {/* ── RIGHT: PRICING BOX ── */}
        <aside style={{ width: 380, flexShrink: 0 }}>
          <div style={{
            position: 'sticky', top: 88, padding: 36, borderRadius: 24,
            background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(24px) saturate(1.8)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 4px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.03)',
            transition: `box-shadow 0.4s ${easeOut}`,
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 28, letterSpacing: '-0.02em' }}>Twoja konfiguracja</h3>

            {pricing.items.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', animation: `cfgFadeIn 0.4s ${ease}` }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Package size={26} color="#94A3B8" />
                </div>
                <div style={{ fontSize: 15, color: '#94A3B8', fontWeight: 500 }}>Wybierz moduły,<br />aby zobaczyć wycenę</div>
              </div>
            ) : (
              <div style={{ marginBottom: 28 }}>
                {pricing.items.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 8px',
                    borderBottom: '1px solid #F1F5F9',
                    animation: `cfgSlideUp 0.35s ${ease} ${i * 50}ms both`,
                    background: flashItems.has(i) ? 'rgba(79,70,229,0.04)' : 'transparent',
                    transition: 'background 0.4s ease', borderRadius: 8, marginLeft: -8, marginRight: -8,
                  }}>
                    <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 750, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{item.price} zł</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price */}
            <div style={{
              borderRadius: 18, padding: 28, marginBottom: 28, position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(145deg, #F0FDF4 0%, #ECFDF5 50%, #D1FAE5 100%)',
              border: '1px solid rgba(16,185,129,0.12)',
              boxShadow: pricePulse ? '0 0 0 3px rgba(16,185,129,0.15), inset 0 1px 0 rgba(255,255,255,0.6)' : 'inset 0 1px 0 rgba(255,255,255,0.6)',
              transition: 'box-shadow 0.4s ease',
            }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', filter: 'blur(20px)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, position: 'relative' }}>
                <span style={{ fontSize: 15, fontWeight: 650, color: '#064E3B' }}>Dziś płacisz:</span>
                <span style={{ fontSize: 42, fontWeight: 900, color: '#059669', letterSpacing: '-0.05em', lineHeight: 1, textShadow: '0 2px 8px rgba(16,185,129,0.15)', transform: pricePulse ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-block' }}>0 zł</span>
              </div>
              <div style={{ height: 1, background: 'rgba(16,185,129,0.12)', margin: '0 0 12px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', position: 'relative' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#064E3B' }}>Po 14 dniach:</span>
                <span style={{ fontSize: 22, fontWeight: 850, color: '#0F172A', fontVariantNumeric: 'tabular-nums', transform: pricePulse ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)', display: 'inline-block' }}>
                  <AnimatedPrice value={pricing.monthly} /> zł <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ msc</span>
                </span>
              </div>
            </div>

            {/* CTA */}
            <button className="cfg-cta-btn" style={{
              width: '100%', padding: '18px 20px', borderRadius: 16, border: 'none',
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
              Rozpocznij za darmo <span style={{ opacity: 0.65, fontWeight: 500 }}>(14 dni)</span> <ArrowRight size={18} />
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 12, fontWeight: 450, lineHeight: 1.5 }}>
              Możesz zacząć za darmo i skonfigurować wszystko później.
            </p>

            <button style={{
              width: '100%', padding: '15px 20px', borderRadius: 16, marginTop: 12,
              border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)',
              color: '#334155', fontSize: 14, fontWeight: 650, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: `all 0.25s ${ease}`, backdropFilter: 'blur(8px)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.background = 'linear-gradient(135deg, #F5F3FF, #EEF2FF)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'rgba(255,255,255,0.8)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
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
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 475 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes cfgSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cfgFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cfgPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.95); } }
        @keyframes cfgModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .cfg-integration:hover .cfg-int-arrow { transform: translateX(3px) !important; }
        .cfg-cta-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; border-radius: inherit; }
        .cfg-cta-btn:hover::after { opacity: 1; }
        html { scroll-behavior: smooth; }
        input[type="range"]::-webkit-slider-thumb { cursor: pointer; }
      `}</style>
    </div>
  );
}
