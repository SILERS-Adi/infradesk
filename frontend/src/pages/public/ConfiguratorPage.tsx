/**
 * InfraDesk UX 1.0 — Module Configurator / Onboarding
 * Premium SaaS configuration flow inspired by Stripe, Notion, Linear
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Monitor, FileText, Package, Car, Headphones, Check,
  ChevronRight, Plug, Shield, Zap, ArrowRight, MessageCircle,
  Building2, Users, Globe, ShoppingCart, Scan, Calendar,
} from 'lucide-react';

// ── Types ──

interface ModuleDef {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  priceFrom: number;
  hasVariants?: boolean;
  showIntegrations?: boolean;
}

interface VariantDef {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: React.ElementType;
  badge?: string;
}

interface IntegrationDef {
  id: string;
  name: string;
  icon: string;
  category: string;
}

interface AddonDef {
  id: string;
  name: string;
  description: string;
  price: number | null;
  badge?: string;
  icon: React.ElementType;
}

// ── Data ──

const MODULES: ModuleDef[] = [
  {
    id: 'infra',
    name: 'Zarządzanie infrastrukturą IT',
    description: 'Komputery, sieci, użytkownicy, monitoring — pełna kontrola nad środowiskiem IT firmy.',
    icon: Monitor,
    features: ['Zarządzanie komputerami', 'Użytkownicy i uprawnienia', 'Monitoring sieci', 'Obsługa środowiska IT'],
    priceFrom: 49,
    hasVariants: true,
  },
  {
    id: 'sales',
    name: 'Sprzedaż',
    description: 'Faktury, paragony, dokumenty handlowe, kartoteka towarów i kontrahentów.',
    icon: FileText,
    features: ['Faktury sprzedaży i zakupu', 'Paragony', 'Kartoteka towarów', 'Kontrahenci i dokumenty'],
    priceFrom: 59,
    showIntegrations: true,
  },
  {
    id: 'packing',
    name: 'Pakowanie',
    description: 'Kompletacja, skanowanie, statusy pakowania — sprawny fulfillment zamówień.',
    icon: Package,
    features: ['Kompletacja zamówień', 'Skanowanie produktów', 'Statusy pakowania', 'Obsługa wysyłek'],
    priceFrom: 79,
    showIntegrations: true,
  },
  {
    id: 'diagnostic',
    name: 'Stacje diagnostyczne',
    description: 'Moduł branżowy dla stacji kontroli pojazdów — terminy, przypomnienia, procesy SKP.',
    icon: Car,
    features: ['Zarządzanie terminami', 'Przypomnienia klientów', 'Procesy stacji', 'Dokumentacja przeglądów'],
    priceFrom: 99,
  },
];

const VARIANTS: Record<string, VariantDef[]> = {
  infra: [
    { id: 'solo', name: 'SOLO', description: 'Jedna firma, jedno środowisko IT. Idealne dla MŚP.', price: 49, icon: Building2 },
    { id: 'multi', name: 'MULTI', description: 'Wiele firm, wiele podmiotów. Dla partnerów IT i grup.', price: 149, icon: Users, badge: 'Popularne' },
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
  { id: 'it-support', name: 'Obsługa informatyczna', description: 'Zostaw IT nam — zajmiemy się Twoją infrastrukturą.', price: 99, icon: Headphones },
  { id: 'onboarding', name: 'Pomoc przy wdrożeniu', description: 'Pomożemy Ci wszystko skonfigurować i uruchomić.', price: null, badge: 'GRATIS 14 dni', icon: Zap },
];

// ── Component ──

export default function ConfiguratorPage() {
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set());
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set(['onboarding']));

  const toggleModule = (id: string) => {
    setActiveModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleAddon = (id: string) => {
    setActiveAddons(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Price calculation
  const pricing = useMemo(() => {
    let monthly = 0;
    const items: { name: string; price: number }[] = [];

    activeModules.forEach(modId => {
      const mod = MODULES.find(m => m.id === modId);
      if (!mod) return;

      if (mod.hasVariants && VARIANTS[modId]) {
        const variant = VARIANTS[modId].find(v => v.id === selectedVariant[modId]);
        if (variant) {
          items.push({ name: `${mod.name} (${variant.name})`, price: variant.price });
          monthly += variant.price;
        } else {
          items.push({ name: mod.name, price: mod.priceFrom });
          monthly += mod.priceFrom;
        }
      } else {
        items.push({ name: mod.name, price: mod.priceFrom });
        monthly += mod.priceFrom;
      }
    });

    activeAddons.forEach(addonId => {
      const addon = ADDONS.find(a => a.id === addonId);
      if (addon?.price) {
        items.push({ name: addon.name, price: addon.price });
        monthly += addon.price;
      }
    });

    return { items, monthly };
  }, [activeModules, selectedVariant, activeAddons]);

  const showIntegrations = activeModules.has('sales') || activeModules.has('packing');

  return (
    <div style={{ minHeight: '100vh', background: '#FAFBFC', color: '#111827', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250,251,252,0.85)',
        backdropFilter: 'blur(12px)', borderBottom: '1px solid #E5E7EB',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={16} color="#fff" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>InfraDesk</span>
          </div>
          <Link to="/login" style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', textDecoration: 'none' }}>
            Masz konto? <span style={{ color: '#4F46E5', fontWeight: 600 }}>Zaloguj się</span>
          </Link>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 40 }}>

        {/* ── LEFT: CONFIGURATOR (70%) ── */}
        <main style={{ flex: '1 1 0', minWidth: 0, paddingBottom: 80 }}>

          {/* HERO */}
          <section style={{ padding: '56px 0 40px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, marginBottom: 20,
              background: '#ECFDF5', color: '#059669', fontSize: 13, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              14 dni za darmo — bez karty
            </div>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 12px' }}>
              Zbuduj swój system<br />dopasowany do firmy
            </h1>
            <p style={{ fontSize: 18, color: '#6B7280', lineHeight: 1.6, maxWidth: 540, margin: 0 }}>
              Wybierz moduły, skonfiguruj i uruchom w 5 minut. Bez zobowiązań.
            </p>
          </section>

          {/* ── MODULES ── */}
          <section>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', marginBottom: 20 }}>Wybierz moduły</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {MODULES.map(mod => {
                const active = activeModules.has(mod.id);
                const Icon = mod.icon;
                return (
                  <div key={mod.id}>
                    <div
                      onClick={() => toggleModule(mod.id)}
                      style={{
                        padding: 28, borderRadius: 16, cursor: 'pointer',
                        background: active ? '#EEF2FF' : '#fff',
                        border: `2px solid ${active ? '#4F46E5' : '#E5E7EB'}`,
                        boxShadow: active ? '0 0 0 4px rgba(79,70,229,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s ease',
                        transform: active ? 'scale(1.01)' : 'scale(1)',
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12,
                          background: active ? '#4F46E5' : '#F3F4F6',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}>
                          <Icon size={22} color={active ? '#fff' : '#6B7280'} />
                        </div>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: `2px solid ${active ? '#4F46E5' : '#D1D5DB'}`,
                          background: active ? '#4F46E5' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}>
                          {active && <Check size={14} color="#fff" strokeWidth={3} />}
                        </div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6, letterSpacing: '-0.01em' }}>{mod.name}</div>
                      <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.5, marginBottom: 16 }}>{mod.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                        {mod.features.map(f => (
                          <span key={f} style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 6, background: active ? 'rgba(79,70,229,0.08)' : '#F3F4F6', color: active ? '#4F46E5' : '#6B7280' }}>{f}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: active ? '#4F46E5' : '#374151' }}>
                        od {mod.priceFrom} zł <span style={{ fontWeight: 400, color: '#9CA3AF' }}>/ miesiąc</span>
                      </div>
                    </div>

                    {/* ── VARIANTS (below card) ── */}
                    {active && mod.hasVariants && VARIANTS[mod.id] && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 12, animation: 'fadeIn 0.3s ease' }}>
                        {VARIANTS[mod.id].map(v => {
                          const sel = selectedVariant[mod.id] === v.id;
                          const VIcon = v.icon;
                          return (
                            <div key={v.id} onClick={() => setSelectedVariant({ ...selectedVariant, [mod.id]: v.id })}
                              style={{
                                flex: 1, padding: 20, borderRadius: 12, cursor: 'pointer',
                                background: sel ? '#EEF2FF' : '#fff',
                                border: `2px solid ${sel ? '#4F46E5' : '#E5E7EB'}`,
                                transition: 'all 0.2s',
                                position: 'relative',
                              }}
                            >
                              {v.badge && <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#4F46E5', color: '#fff' }}>{v.badge}</span>}
                              <VIcon size={20} color={sel ? '#4F46E5' : '#9CA3AF'} style={{ marginBottom: 8 }} />
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{v.name}</div>
                              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>{v.description}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: sel ? '#4F46E5' : '#374151' }}>{v.price} zł <span style={{ fontWeight: 400, fontSize: 13, color: '#9CA3AF' }}>/ msc</span></div>
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
            <section style={{ marginTop: 48, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Plug size={18} color="#4F46E5" />
                <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', margin: 0 }}>Integracje</h2>
              </div>
              <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 20 }}>
                Połącz z Twoimi systemami. Obsługujemy każdą platformę z API.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {INTEGRATIONS.map(int => (
                  <div key={int.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 10,
                    background: '#fff', border: '1px solid #E5E7EB',
                    fontSize: 13, fontWeight: 500, color: '#374151',
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#F5F3FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff'; }}
                  >
                    <span style={{ fontSize: 18 }}>{int.icon}</span>
                    {int.name}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ADDONS ── */}
          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', marginBottom: 20 }}>Dodatkowe opcje</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ADDONS.map(addon => {
                const active = activeAddons.has(addon.id);
                const Icon = addon.icon;
                return (
                  <div key={addon.id} onClick={() => toggleAddon(addon.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 12, cursor: 'pointer',
                    background: active ? '#EEF2FF' : '#fff',
                    border: `2px solid ${active ? '#4F46E5' : '#E5E7EB'}`,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: active ? '#4F46E5' : '#F3F4F6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={20} color={active ? '#fff' : '#6B7280'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{addon.name}</span>
                        {addon.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#ECFDF5', color: '#059669' }}>{addon.badge}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#6B7280' }}>{addon.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {addon.price ? (
                        <div style={{ fontSize: 15, fontWeight: 700, color: active ? '#4F46E5' : '#374151' }}>
                          od {addon.price} zł <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}>/ msc</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>Gratis</div>
                      )}
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${active ? '#4F46E5' : '#D1D5DB'}`,
                      background: active ? '#4F46E5' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <Check size={14} color="#fff" strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* ── RIGHT: PRICING BOX (30%) ── */}
        <aside style={{ width: 360, flexShrink: 0 }}>
          <div style={{
            position: 'sticky', top: 88,
            padding: 28, borderRadius: 16,
            background: '#fff', border: '1px solid #E5E7EB',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 20, letterSpacing: '-0.01em' }}>Twoja konfiguracja</h3>

            {pricing.items.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                <div style={{ fontSize: 14, color: '#9CA3AF' }}>Wybierz moduły, aby zobaczyć wycenę</div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                {pricing.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontSize: 14, color: '#374151' }}>{item.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{item.price} zł</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price display */}
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Dziś płacisz:</span>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#059669', letterSpacing: '-0.03em' }}>0 zł</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>Po 14 dniach:</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{pricing.monthly} zł <span style={{ fontSize: 13, fontWeight: 400, color: '#9CA3AF' }}>/ msc</span></span>
              </div>
            </div>

            {/* CTA */}
            <button style={{
              width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(79,70,229,0.3)',
              transition: 'all 0.2s',
              opacity: pricing.items.length > 0 ? 1 : 0.5,
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.3)'; }}
            >
              Wypróbuj za darmo przez 14 dni <ArrowRight size={16} />
            </button>

            <button style={{
              width: '100%', padding: '12px 20px', borderRadius: 12, marginTop: 10,
              border: '1px solid #E5E7EB', background: '#fff',
              color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.background = '#F5F3FF'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#fff'; }}
            >
              <MessageCircle size={15} /> Porozmawiaj z nami
            </button>

            {/* Trust */}
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
                ✓ Bez karty kredytowej<br />
                ✓ Pełny dostęp przez 14 dni<br />
                ✓ Anuluj w każdej chwili
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
