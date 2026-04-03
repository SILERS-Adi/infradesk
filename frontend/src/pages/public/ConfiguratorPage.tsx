/**
 * InfraDesk UX 1.0 — Module Configurator / Onboarding
 * Premium SaaS configuration flow — Stripe/Linear/Notion tier
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Monitor, FileText, Package, Car, Headphones, Check,
  ChevronRight, Plug, Shield, Zap, ArrowRight, MessageCircle,
  Building2, Users, Globe, ShoppingCart, Scan, Calendar, Sparkles,
} from 'lucide-react';

// ── Types (unchanged) ──

interface ModuleDef {
  id: string; name: string; description: string; icon: React.ElementType;
  features: string[]; priceFrom: number; hasVariants?: boolean; showIntegrations?: boolean;
}
interface VariantDef {
  id: string; name: string; description: string; price: number; icon: React.ElementType; badge?: string;
}
interface IntegrationDef { id: string; name: string; icon: string; category: string; }
interface AddonDef {
  id: string; name: string; description: string; price: number | null; badge?: string; icon: React.ElementType;
}

// ── Data (unchanged structure, improved copy) ──

const MODULES: ModuleDef[] = [
  {
    id: 'infra', name: 'Zarządzanie infrastrukturą IT',
    description: 'Pełna kontrola nad środowiskiem IT firmy.',
    icon: Monitor,
    features: ['Zarządzanie komputerami', 'Użytkownicy i uprawnienia', 'Monitoring sieci', 'Obsługa środowiska IT'],
    priceFrom: 49, hasVariants: true,
  },
  {
    id: 'sales', name: 'Sprzedaż',
    description: 'Faktury, paragony i dokumenty handlowe.',
    icon: FileText,
    features: ['Faktury sprzedaży i zakupu', 'Paragony', 'Kartoteka towarów', 'Kontrahenci i dokumenty'],
    priceFrom: 59, showIntegrations: true,
  },
  {
    id: 'packing', name: 'Pakowanie',
    description: 'Sprawny fulfillment zamówień.',
    icon: Package,
    features: ['Kompletacja zamówień', 'Skanowanie produktów', 'Statusy pakowania', 'Obsługa wysyłek'],
    priceFrom: 79, showIntegrations: true,
  },
  {
    id: 'diagnostic', name: 'Stacje diagnostyczne',
    description: 'Moduł branżowy dla SKP i motoryzacji.',
    icon: Car,
    features: ['Zarządzanie terminami', 'Przypomnienia klientów', 'Procesy stacji', 'Dokumentacja przeglądów'],
    priceFrom: 99,
  },
];

const VARIANTS: Record<string, VariantDef[]> = {
  infra: [
    { id: 'solo', name: 'SOLO', description: 'Jedna firma, jedno środowisko IT. Idealne dla MŚP.', price: 49, icon: Building2 },
    { id: 'multi', name: 'MULTI', description: 'Wiele firm i podmiotów. Dla partnerów IT i grup.', price: 149, icon: Users, badge: 'Dla firm i partnerów IT' },
  ],
};

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

// ── Component (same logic, upgraded UI) ──

export default function ConfiguratorPage() {
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set(['onboarding']));

  const toggleModule = (id: string) => {
    setActiveModules(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleAddon = (id: string) => {
    setActiveAddons(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const pricing = useMemo(() => {
    let monthly = 0;
    const items: { name: string; price: number }[] = [];
    activeModules.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId);
      if (!mod) return;
      if (mod.hasVariants && VARIANTS[modId]) {
        const variant = VARIANTS[modId].find(v => v.id === selectedVariant[modId]);
        if (variant) { items.push({ name: `${mod.name} (${variant.name})`, price: variant.price }); monthly += variant.price; }
        else { items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom; }
      } else { items.push({ name: mod.name, price: mod.priceFrom }); monthly += mod.priceFrom; }
    });
    activeAddons.forEach(addonId => {
      const addon = ADDONS.find(a => a.id === addonId);
      if (addon?.price) { items.push({ name: addon.name, price: addon.price }); monthly += addon.price; }
    });
    return { items, monthly };
  }, [activeModules, selectedVariant, activeAddons]);

  const showIntegrations = activeModules.has('sales') || activeModules.has('packing');

  // Shared styles
  const cardBase = (active: boolean): React.CSSProperties => ({
    padding: 28, borderRadius: 20, cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)' : '#fff',
    border: `2px solid ${active ? '#4F46E5' : '#E5E7EB'}`,
    boxShadow: active ? '0 0 0 4px rgba(79,70,229,0.08), 0 8px 24px rgba(79,70,229,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
    transform: active ? 'scale(1.02)' : 'scale(1)',
  });

  const checkBox = (active: boolean): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
    border: `2px solid ${active ? '#4F46E5' : '#D1D5DB'}`,
    background: active ? '#4F46E5' : '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: active ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(248,250,252,0.8)', backdropFilter: 'blur(16px) saturate(1.5)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
            }}>
              <Shield size={17} color="#fff" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em' }}>InfraDesk</span>
          </div>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: '#64748B', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#4F46E5'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; }}>
            Masz konto? <span style={{ fontWeight: 600 }}>Zaloguj się →</span>
          </Link>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', display: 'flex', gap: 48 }}>

        {/* ── LEFT: CONFIGURATOR ── */}
        <main style={{ flex: '1 1 0', minWidth: 0, paddingBottom: 100 }}>

          {/* HERO */}
          <section style={{ padding: '64px 0 52px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 24, marginBottom: 24,
              background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
              color: '#059669', fontSize: 13, fontWeight: 700, letterSpacing: '0.01em',
              boxShadow: '0 1px 4px rgba(16,185,129,0.12)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.5)' }} />
              14 dni za darmo — bez karty
            </div>
            <h1 style={{
              fontSize: 44, fontWeight: 850, color: '#0F172A', letterSpacing: '-0.035em',
              lineHeight: 1.1, margin: '0 0 16px',
              background: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)', WebkitBackgroundClip: 'text',
            }}>
              Zbuduj system dla swojej firmy<br />w 5 minut
            </h1>
            <p style={{ fontSize: 19, color: '#64748B', lineHeight: 1.6, maxWidth: 520, margin: 0, fontWeight: 400 }}>
              Wybierz moduły, połącz z używanymi systemami i zacznij bez ryzyka.
            </p>
          </section>

          {/* ── MODULES ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Sparkles size={16} color="#4F46E5" />
              <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', margin: 0 }}>Wybierz moduły</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              {MODULES.map(mod => {
                const active = activeModules.has(mod.id);
                const Icon = mod.icon;
                return (
                  <div key={mod.id}>
                    <div onClick={() => toggleModule(mod.id)} style={cardBase(active)}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'scale(1)'; } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 14,
                          background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#F1F5F9',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.25s', boxShadow: active ? '0 4px 12px rgba(79,70,229,0.3)' : 'none',
                        }}>
                          <Icon size={24} color={active ? '#fff' : '#64748B'} strokeWidth={1.8} />
                        </div>
                        <div style={checkBox(active)}>
                          {active && <Check size={15} color="#fff" strokeWidth={3} />}
                        </div>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 750, color: '#0F172A', marginBottom: 10, letterSpacing: '-0.02em' }}>{mod.name}</div>
                      {/* Feature bullets instead of description */}
                      <div style={{ marginBottom: 18 }}>
                        {mod.features.map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#4F46E5' : '#CBD5E1', flexShrink: 0, transition: 'background 0.2s' }} />
                            <span style={{ fontSize: 13, color: active ? '#334155' : '#64748B', fontWeight: 450, transition: 'color 0.2s' }}>{f}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ paddingTop: 14, borderTop: `1px solid ${active ? 'rgba(79,70,229,0.15)' : '#F1F5F9'}` }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: active ? '#4F46E5' : '#0F172A', letterSpacing: '-0.02em', transition: 'color 0.2s' }}>{mod.priceFrom} zł</span>
                        <span style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>/ miesiąc</span>
                      </div>
                    </div>

                    {/* VARIANTS */}
                    {active && mod.hasVariants && VARIANTS[mod.id] && (
                      <div style={{ marginTop: 14, display: 'flex', gap: 14, animation: 'cfgSlideIn 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
                        {VARIANTS[mod.id].map(v => {
                          const sel = selectedVariant[mod.id] === v.id;
                          const VIcon = v.icon;
                          return (
                            <div key={v.id} onClick={() => setSelectedVariant({ ...selectedVariant, [mod.id]: v.id })}
                              style={{
                                flex: 1, padding: 24, borderRadius: 16, cursor: 'pointer', position: 'relative',
                                background: sel ? 'linear-gradient(135deg, #EEF2FF, #F5F3FF)' : '#fff',
                                border: `2px solid ${sel ? '#4F46E5' : '#E2E8F0'}`,
                                boxShadow: sel ? '0 0 0 4px rgba(79,70,229,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                              }}
                              onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#C7D2FE'; }}
                              onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#E2E8F0'; }}
                            >
                              {v.badge && <span style={{ position: 'absolute', top: -10, right: 14, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>{v.badge}</span>}
                              <VIcon size={22} color={sel ? '#4F46E5' : '#94A3B8'} style={{ marginBottom: 10 }} />
                              <div style={{ fontSize: 16, fontWeight: 750, color: '#0F172A', marginBottom: 6 }}>{v.name}</div>
                              <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>{v.description}</div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: sel ? '#4F46E5' : '#0F172A' }}>{v.price} zł <span style={{ fontWeight: 400, fontSize: 13, color: '#94A3B8' }}>/ msc</span></div>
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
            <section style={{ marginTop: 56, animation: 'cfgSlideIn 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Plug size={16} color="#4F46E5" />
                <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', margin: 0 }}>Integracje</h2>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 750, color: '#0F172A', letterSpacing: '-0.02em', marginBottom: 6 }}>Działa z Twoimi systemami</h3>
              <p style={{ fontSize: 15, color: '#64748B', marginBottom: 24 }}>Podłącz sklepy, marketplace i systemy przez API.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {INTEGRATIONS.map(int => (
                  <div key={int.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '16px 20px', borderRadius: 14,
                    background: '#fff', border: '1px solid #E2E8F0',
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#F5F3FF'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{int.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>{int.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ADDONS ── */}
          <section style={{ marginTop: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Zap size={16} color="#4F46E5" />
              <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94A3B8', margin: 0 }}>Dodatkowe opcje</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {ADDONS.map(addon => {
                const active = activeAddons.has(addon.id);
                const Icon = addon.icon;
                return (
                  <div key={addon.id} onClick={() => toggleAddon(addon.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 18, padding: 24, borderRadius: 16, cursor: 'pointer',
                    background: active ? 'linear-gradient(135deg, #EEF2FF, #F5F3FF)' : '#fff',
                    border: `2px solid ${active ? '#4F46E5' : '#E2E8F0'}`,
                    boxShadow: active ? '0 0 0 4px rgba(79,70,229,0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = active ? '#4F46E5' : '#E2E8F0'; e.currentTarget.style.transform = 'translateY(0)'; } }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: active ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: active ? '0 4px 12px rgba(79,70,229,0.25)' : 'none', transition: 'all 0.2s',
                    }}>
                      <Icon size={22} color={active ? '#fff' : '#64748B'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{addon.name}</span>
                        {addon.badge && <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 12, background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)', color: '#059669', letterSpacing: '0.02em' }}>{addon.badge}</span>}
                      </div>
                      <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>{addon.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
                      {addon.price ? (
                        <div><span style={{ fontSize: 18, fontWeight: 800, color: active ? '#4F46E5' : '#0F172A' }}>{addon.price} zł</span><span style={{ fontSize: 13, color: '#94A3B8' }}> / msc</span></div>
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>Gratis</div>
                      )}
                    </div>
                    <div style={checkBox(active)}>
                      {active && <Check size={15} color="#fff" strokeWidth={3} />}
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
            position: 'sticky', top: 88, padding: 32, borderRadius: 20,
            background: '#fff', border: '1px solid #E2E8F0',
            boxShadow: '0 4px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 750, color: '#0F172A', marginBottom: 24, letterSpacing: '-0.02em' }}>Twoja konfiguracja</h3>

            {pricing.items.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Package size={24} color="#94A3B8" />
                </div>
                <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500 }}>Wybierz moduły, aby zobaczyć wycenę</div>
              </div>
            ) : (
              <div style={{ marginBottom: 24 }}>
                {pricing.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{item.price} zł</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price display */}
            <div style={{ background: 'linear-gradient(135deg, #F0FDF4, #ECFDF5)', borderRadius: 16, padding: 24, marginBottom: 24, border: '1px solid rgba(16,185,129,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#064E3B' }}>Dziś płacisz:</span>
                <span style={{ fontSize: 36, fontWeight: 900, color: '#059669', letterSpacing: '-0.04em' }}>0 zł</span>
              </div>
              <div style={{ height: 1, background: 'rgba(16,185,129,0.15)', margin: '4px 0 10px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#064E3B' }}>Po 14 dniach:</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{pricing.monthly} zł <span style={{ fontSize: 13, fontWeight: 400, color: '#94A3B8' }}>/ msc</span></span>
              </div>
            </div>

            {/* CTA */}
            <button style={{
              width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              color: '#fff', fontSize: 16, fontWeight: 750, cursor: 'pointer', letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 16px rgba(79,70,229,0.35), 0 1px 3px rgba(79,70,229,0.2)',
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
              opacity: pricing.items.length > 0 ? 1 : 0.6,
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.4), 0 2px 6px rgba(79,70,229,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.35), 0 1px 3px rgba(79,70,229,0.2)'; }}
            >
              Rozpocznij za darmo <span style={{ opacity: 0.7 }}>(14 dni)</span> <ArrowRight size={18} />
            </button>

            <button style={{
              width: '100%', padding: '14px 20px', borderRadius: 14, marginTop: 12,
              border: '1px solid #E2E8F0', background: '#fff',
              color: '#334155', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#F5F3FF'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <MessageCircle size={16} /> Porozmawiaj z nami
            </button>

            {/* Trust */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Bez karty kredytowej', 'Bez umowy i zobowiązań', 'Możesz zrezygnować w każdej chwili', 'Pełny dostęp przez 14 dni'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={14} color="#059669" strokeWidth={3} />
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 450 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes cfgSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
