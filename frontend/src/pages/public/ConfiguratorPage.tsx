/**
 * InfraDesk UX 1.0 — Module Configurator / Onboarding
 * Premium SaaS — Stripe/Linear/Notion polish level
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Monitor, FileText, Package, Car, Headphones, Check,
  ChevronRight, Plug, Shield, Zap, ArrowRight, MessageCircle,
  Building2, Users, Globe, ShoppingCart, Scan, Calendar, Sparkles,
} from 'lucide-react';

// ── Types ──
interface ModuleDef { id: string; name: string; description: string; icon: React.ElementType; features: string[]; priceFrom: number; hasVariants?: boolean; showIntegrations?: boolean; }
interface VariantDef { id: string; name: string; description: string; price: number; icon: React.ElementType; badge?: string; }
interface IntegrationDef { id: string; name: string; icon: string; category: string; }
interface AddonDef { id: string; name: string; description: string; price: number | null; badge?: string; icon: React.ElementType; }

// ── Data ──
const MODULES: ModuleDef[] = [
  { id: 'infra', name: 'Zarządzanie infrastrukturą IT', description: 'Pełna kontrola nad środowiskiem IT firmy.', icon: Monitor, features: ['Zarządzanie komputerami', 'Użytkownicy i uprawnienia', 'Monitoring sieci', 'Obsługa środowiska IT'], priceFrom: 49, hasVariants: true },
  { id: 'sales', name: 'Sprzedaż', description: 'Faktury, paragony i dokumenty handlowe.', icon: FileText, features: ['Faktury sprzedaży i zakupu', 'Paragony', 'Kartoteka towarów', 'Kontrahenci i dokumenty'], priceFrom: 59, showIntegrations: true },
  { id: 'packing', name: 'Pakowanie', description: 'Sprawny fulfillment zamówień.', icon: Package, features: ['Kompletacja zamówień', 'Skanowanie produktów', 'Statusy pakowania', 'Obsługa wysyłek'], priceFrom: 79, showIntegrations: true },
  { id: 'diagnostic', name: 'Stacje diagnostyczne', description: 'Moduł branżowy dla SKP i motoryzacji.', icon: Car, features: ['Zarządzanie terminami', 'Przypomnienia klientów', 'Procesy stacji', 'Dokumentacja przeglądów'], priceFrom: 99 },
];
const VARIANTS: Record<string, VariantDef[]> = { infra: [
  { id: 'solo', name: 'SOLO', description: 'Jedna firma, jedno środowisko IT. Idealne dla MŚP.', price: 49, icon: Building2 },
  { id: 'multi', name: 'MULTI', description: 'Wiele firm i podmiotów. Dla partnerów IT i grup.', price: 149, icon: Users, badge: 'Dla firm i partnerów IT' },
]};
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
    const start = prev.current; const end = value; const dur = 400;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(start + (end - start) * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    prev.current = value;
  }, [value]);
  return <>{display}</>;
}

// ── Component ──
export default function ConfiguratorPage() {
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set(['onboarding']));

  const toggleModule = (id: string) => { setActiveModules(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAddon = (id: string) => { setActiveAddons(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  const pricing = useMemo(() => {
    let monthly = 0; const items: { name: string; price: number }[] = [];
    activeModules.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId); if (!mod) return;
      if (mod.hasVariants && VARIANTS[modId]) { const v = VARIANTS[modId].find(v => v.id === selectedVariant[modId]); if (v) { items.push({ name: `${mod.name} (${v.name})`, price: v.price }); monthly += v.price; } else { items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom; } }
      else { items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom; }
    });
    activeAddons.forEach(id => { const a = ADDONS.find(a => a.id === id); if (a?.price) { items.push({ name: a.name, price: a.price }); monthly += a.price; } });
    return { items, monthly };
  }, [activeModules, selectedVariant, activeAddons]);

  const showIntegrations = activeModules.has('sales') || activeModules.has('packing');
  const ease = 'cubic-bezier(0.16,1,0.3,1)';
  const easeOut = 'cubic-bezier(0.4,0,0.2,1)';

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── AMBIENT GLOW (subtle background effect) ── */}
      <div style={{ position: 'fixed', top: -200, left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 200, right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.03) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── TOP BAR ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(248,250,252,0.72)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(79,70,229,0.35)' }}>
              <Shield size={17} color="#fff" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em' }}>InfraDesk</span>
          </div>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: '#64748B', textDecoration: 'none', transition: `color 0.15s ${easeOut}` }}
            onMouseEnter={e => { e.currentTarget.style.color = '#4F46E5'; }} onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; }}>
            Masz konto? <span style={{ fontWeight: 600 }}>Zaloguj się →</span>
          </Link>
        </div>
      </header>

      {/* ── MAIN ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', display: 'flex', gap: 56, position: 'relative', zIndex: 1 }}>

        <main style={{ flex: '1 1 0', minWidth: 0, paddingBottom: 120 }}>

          {/* ── HERO ── */}
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

          {/* ── MODULES ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              <Sparkles size={16} color="#4F46E5" />
              <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Wybierz moduły</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
              {MODULES.map(mod => {
                const active = activeModules.has(mod.id);
                const Icon = mod.icon;
                return (
                  <div key={mod.id}>
                    <div onClick={() => toggleModule(mod.id)} style={{
                      padding: 32, borderRadius: 22, cursor: 'pointer',
                      background: active ? 'linear-gradient(160deg, #EEF2FF 0%, #F5F3FF 50%, #fff 100%)' : '#fff',
                      border: `2px solid ${active ? '#818CF8' : '#E2E8F0'}`,
                      boxShadow: active
                        ? '0 0 0 4px rgba(99,102,241,0.1), 0 12px 32px rgba(79,70,229,0.12), 0 2px 4px rgba(79,70,229,0.06)'
                        : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
                      transition: `all 0.25s ${ease}`,
                      transform: active ? 'scale(1.02)' : 'scale(1)',
                    }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.07), 0 4px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'translateY(-3px)'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'scale(1)'; } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 16,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'linear-gradient(135deg, #F1F5F9, #E2E8F0)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: `all 0.3s ${ease}`,
                          boxShadow: active ? '0 6px 16px rgba(79,70,229,0.35)' : '0 1px 3px rgba(0,0,0,0.06)',
                        }}>
                          <Icon size={26} color={active ? '#fff' : '#64748B'} strokeWidth={1.7} />
                        </div>
                        {/* Custom toggle */}
                        <div style={{
                          width: 44, height: 26, borderRadius: 13, padding: 2, cursor: 'pointer',
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#E2E8F0',
                          transition: `all 0.3s ${ease}`,
                          boxShadow: active ? '0 2px 8px rgba(79,70,229,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 11, background: '#fff',
                            transform: active ? 'translateX(18px)' : 'translateX(0)',
                            transition: `transform 0.3s ${ease}`,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                          }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 750, color: '#0F172A', marginBottom: 14, letterSpacing: '-0.02em' }}>{mod.name}</div>
                      <div style={{ marginBottom: 20 }}>
                        {mod.features.map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, background: active ? 'rgba(79,70,229,0.1)' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: `all 0.2s ${easeOut}` }}>
                              <Check size={11} color={active ? '#4F46E5' : '#94A3B8'} strokeWidth={2.5} />
                            </div>
                            <span style={{ fontSize: 14, color: active ? '#334155' : '#64748B', fontWeight: 450, transition: `color 0.2s ${easeOut}` }}>{f}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ paddingTop: 16, borderTop: `1px solid ${active ? 'rgba(99,102,241,0.12)' : '#F1F5F9'}`, transition: `border-color 0.2s ${easeOut}` }}>
                        <span style={{ fontSize: 26, fontWeight: 850, color: active ? '#4F46E5' : '#0F172A', letterSpacing: '-0.03em', transition: `color 0.2s ${easeOut}` }}>{mod.priceFrom} zł</span>
                        <span style={{ fontSize: 15, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>/ miesiąc</span>
                      </div>
                    </div>

                    {/* VARIANTS */}
                    {active && mod.hasVariants && VARIANTS[mod.id] && (
                      <div style={{ marginTop: 16, display: 'flex', gap: 16, animation: `cfgSlideIn 0.4s ${ease}` }}>
                        {VARIANTS[mod.id].map(v => {
                          const sel = selectedVariant[mod.id] === v.id;
                          const VI = v.icon;
                          return (
                            <div key={v.id} onClick={() => setSelectedVariant({ ...selectedVariant, [mod.id]: v.id })} style={{
                              flex: 1, padding: 28, borderRadius: 18, cursor: 'pointer', position: 'relative',
                              background: sel ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF, #fff)' : '#fff',
                              border: `2px solid ${sel ? '#818CF8' : '#E2E8F0'}`,
                              boxShadow: sel ? '0 0 0 4px rgba(99,102,241,0.08), 0 8px 24px rgba(79,70,229,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                              transition: `all 0.25s ${ease}`,
                              transform: sel ? 'scale(1.01)' : 'scale(1)',
                            }}
                              onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                              onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.transform = 'scale(1)'; } }}
                            >
                              {v.badge && <span style={{ position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 12, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', boxShadow: '0 3px 10px rgba(79,70,229,0.35)', letterSpacing: '0.01em' }}>{v.badge}</span>}
                              <div style={{ width: 40, height: 40, borderRadius: 12, background: sel ? 'rgba(79,70,229,0.1)' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, transition: `all 0.2s ${easeOut}` }}>
                                <VI size={22} color={sel ? '#4F46E5' : '#94A3B8'} />
                              </div>
                              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>{v.name}</div>
                              <div style={{ fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>{v.description}</div>
                              <div><span style={{ fontSize: 22, fontWeight: 850, color: sel ? '#4F46E5' : '#0F172A', transition: `color 0.2s ${easeOut}` }}>{v.price} zł</span><span style={{ fontSize: 14, color: '#94A3B8' }}> / msc</span></div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── INTEGRATIONS ── */}
          {showIntegrations && (
            <section style={{ marginTop: 64, animation: `cfgSlideIn 0.4s ${ease}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Plug size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Integracje</h2>
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 6 }}>Działa z Twoimi systemami</h3>
              <p style={{ fontSize: 16, color: '#64748B', marginBottom: 28 }}>Podłącz sklepy, marketplace i systemy przez API.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {INTEGRATIONS.map(int => (
                  <div key={int.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderRadius: 16,
                    background: '#fff', border: '1px solid #E2E8F0',
                    transition: `all 0.2s ${ease}`,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.background = 'linear-gradient(135deg, #F5F3FF, #EEF2FF)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,70,229,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{int.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 650, color: '#334155' }}>{int.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ADDONS ── */}
          <section style={{ marginTop: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              <Zap size={16} color="#4F46E5" />
              <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94A3B8', margin: 0 }}>Dodatkowe opcje</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {ADDONS.map(addon => {
                const active = activeAddons.has(addon.id);
                const Icon = addon.icon;
                return (
                  <div key={addon.id} onClick={() => toggleAddon(addon.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18, cursor: 'pointer',
                    background: active ? 'linear-gradient(160deg, #EEF2FF, #F5F3FF, #fff)' : '#fff',
                    border: `2px solid ${active ? '#818CF8' : '#E2E8F0'}`,
                    boxShadow: active ? '0 0 0 4px rgba(99,102,241,0.08), 0 8px 20px rgba(79,70,229,0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: `all 0.25s ${ease}`,
                  }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = active ? '#818CF8' : '#E2E8F0'; e.currentTarget.style.transform = 'translateY(0)'; if (!active) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'; }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                      background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : 'linear-gradient(135deg, #F1F5F9, #E2E8F0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: active ? '0 6px 16px rgba(79,70,229,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                      transition: `all 0.25s ${ease}`,
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
                        <div><span style={{ fontSize: 20, fontWeight: 850, color: active ? '#4F46E5' : '#0F172A', transition: `color 0.2s ${easeOut}` }}>{addon.price} zł</span><span style={{ fontSize: 13, color: '#94A3B8' }}> / msc</span></div>
                      ) : (
                        <div style={{ fontSize: 15, fontWeight: 750, color: '#059669' }}>Gratis</div>
                      )}
                    </div>
                    {/* Toggle */}
                    <div style={{
                      width: 44, height: 26, borderRadius: 13, padding: 2, flexShrink: 0,
                      background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#E2E8F0',
                      transition: `all 0.3s ${ease}`,
                      boxShadow: active ? '0 2px 8px rgba(79,70,229,0.35)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: 11, background: '#fff', transform: active ? 'translateX(18px)' : 'translateX(0)', transition: `transform 0.3s ${ease}`, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* ── RIGHT: PRICING BOX ── */}
        <aside style={{ width: 380, flexShrink: 0 }}>
          <div style={{
            position: 'sticky', top: 88, padding: 36, borderRadius: 24,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px) saturate(1.5)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 4px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 28, letterSpacing: '-0.02em' }}>Twoja konfiguracja</h3>

            {pricing.items.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Package size={26} color="#94A3B8" />
                </div>
                <div style={{ fontSize: 15, color: '#94A3B8', fontWeight: 500 }}>Wybierz moduły,<br />aby zobaczyć wycenę</div>
              </div>
            ) : (
              <div style={{ marginBottom: 28 }}>
                {pricing.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid #F1F5F9', animation: `cfgSlideIn 0.3s ${ease} ${i * 0.05}s both` }}>
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
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
            }}>
              {/* Subtle glow */}
              <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', filter: 'blur(20px)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, position: 'relative' }}>
                <span style={{ fontSize: 15, fontWeight: 650, color: '#064E3B' }}>Dziś płacisz:</span>
                <span style={{ fontSize: 42, fontWeight: 900, color: '#059669', letterSpacing: '-0.05em', lineHeight: 1, textShadow: '0 2px 8px rgba(16,185,129,0.15)' }}>0 zł</span>
              </div>
              <div style={{ height: 1, background: 'rgba(16,185,129,0.12)', margin: '0 0 12px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', position: 'relative' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#064E3B' }}>Po 14 dniach:</span>
                <span style={{ fontSize: 22, fontWeight: 850, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedPrice value={pricing.monthly} /> zł <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>/ msc</span>
                </span>
              </div>
            </div>

            {/* CTA */}
            <button style={{
              width: '100%', padding: '18px 20px', borderRadius: 16, border: 'none',
              background: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)',
              color: '#fff', fontSize: 16, fontWeight: 750, cursor: 'pointer', letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 6px 20px rgba(79,70,229,0.35), 0 2px 4px rgba(79,70,229,0.15)',
              transition: `all 0.25s ${ease}`,
              opacity: pricing.items.length > 0 ? 1 : 0.55,
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.4), 0 4px 8px rgba(79,70,229,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.35), 0 2px 4px rgba(79,70,229,0.15)'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0) scale(0.98)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)'; }}
            >
              Rozpocznij za darmo <span style={{ opacity: 0.65, fontWeight: 500 }}>(14 dni)</span> <ArrowRight size={18} />
            </button>

            <button style={{
              width: '100%', padding: '15px 20px', borderRadius: 16, marginTop: 12,
              border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)',
              color: '#334155', fontSize: 14, fontWeight: 650, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: `all 0.2s ${ease}`, backdropFilter: 'blur(8px)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.background = 'linear-gradient(135deg, #F5F3FF, #EEF2FF)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'rgba(255,255,255,0.8)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <MessageCircle size={16} /> Porozmawiaj z nami
            </button>

            {/* Trust */}
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Bez karty kredytowej', 'Bez umowy i zobowiązań', 'Możesz zrezygnować w każdej chwili', 'Pełny dostęp przez 14 dni'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        @keyframes cfgSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cfgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
