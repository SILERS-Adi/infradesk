import { useEffect, useMemo, useState } from 'react';
import { Settings, User2, Shield, Bell, Plug, Palette, AlertTriangle } from 'lucide-react';
import { AccountSection } from './sections/AccountSection';
import { SecuritySection } from './sections/SecuritySection';
import { NotificationsSection } from './sections/NotificationsSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { DangerZoneSection } from './sections/DangerZoneSection';

interface TocEntry {
  id: string;
  label: string;
  icon: typeof User2;
}

const TOC: TocEntry[] = [
  { id: 'konto', label: 'Konto', icon: User2 },
  { id: 'bezpieczenstwo', label: 'Bezpieczeństwo', icon: Shield },
  { id: 'powiadomienia', label: 'Powiadomienia', icon: Bell },
  { id: 'integracje', label: 'Integracje', icon: Plug },
  { id: 'wyglad', label: 'Wygląd', icon: Palette },
  { id: 'strefa-niebezpieczna', label: 'Strefa niebezpieczna', icon: AlertTriangle },
];

export function SettingsPage() {
  const [active, setActive] = useState<string>(TOC[0]!.id);

  // Scroll-spy: update TOC highlight as the user scrolls through sections.
  useEffect(() => {
    const sections = TOC.map((t) => document.getElementById(t.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    for (const el of sections) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleJump(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
    setActive(id);
    // Update URL hash without triggering native jump
    history.replaceState(null, '', `#${id}`);
  }

  // Initial hash navigation
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && TOC.some((t) => t.id === hash)) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'auto' });
          setActive(hash);
        }
      }, 50);
    }
  }, []);

  const header = useMemo(
    () => (
      <div className="mb-[var(--sp-5)]">
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Settings size={18} className="text-[var(--pri)]" /> Ustawienia
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-1">
          Twoje konto, bezpieczeństwo, powiadomienia i integracje.
        </p>
      </div>
    ),
    [],
  );

  return (
    <div className="max-w-5xl mx-auto">
      {header}
      <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-[var(--sp-6)]">
        <aside className="hidden md:block">
          <nav className="sticky top-20 space-y-0.5">
            {TOC.map(({ id, label, icon: Icon }) => {
              const isActive = active === id;
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={(e) => handleJump(id, e)}
                  className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-s)] text-[13px] transition-colors"
                  style={{
                    background: isActive ? 'var(--pri-l)' : 'transparent',
                    color: isActive ? 'var(--pri)' : 'var(--tx2)',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-[var(--sp-5)] min-w-0">
          <section id="konto" className="scroll-mt-20">
            <AccountSection />
          </section>
          <section id="bezpieczenstwo" className="scroll-mt-20">
            <SecuritySection />
          </section>
          <section id="powiadomienia" className="scroll-mt-20">
            <NotificationsSection />
          </section>
          <section id="integracje" className="scroll-mt-20">
            <IntegrationsSection />
          </section>
          <section id="wyglad" className="scroll-mt-20">
            <AppearanceSection />
          </section>
          <section id="strefa-niebezpieczna" className="scroll-mt-20">
            <DangerZoneSection />
          </section>
        </main>
      </div>
    </div>
  );
}
