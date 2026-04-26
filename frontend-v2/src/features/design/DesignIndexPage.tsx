/**
 * DesignIndexPage — hub for the InfraDesk V2 design system.
 *
 * Route: /design  (inside AppShell)
 *
 * Purpose: single entry point that links out to every canonical design
 * document (IrisCore orb, UI system showcase, rules). When someone asks
 * "czy ten button wyglada jak reszta panelu?" — zacznij tutaj.
 */

import { Link } from 'react-router-dom';
import { Sparkles, LayoutList, ShieldCheck, ArrowRight } from 'lucide-react';

interface DesignCard {
  to: string;
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  desc: string;
  status: 'ready' | 'wip' | 'planned';
}

const CARDS: DesignCard[] = [
  {
    to: '/design/id-core',
    icon: Sparkles,
    title: 'Rdzen ID',
    subtitle: 'IrisCore — orb AI',
    desc:
      'Kanoniczna wizualizacja Rdzenia ID uzywana w calym ekosystemie Silers AI: InfraDesk v2 (web), ' +
      'Asystent Business (desktop), Mariusz Agent, Client Agent. Jeden komponent — jeden wyglad.',
    status: 'ready',
  },
  {
    to: '/design/ui',
    icon: LayoutList,
    title: 'System UI',
    subtitle: 'Typografia, kolory, komponenty',
    desc:
      'Pelny jezyk wizualny V2: tokeny CSS, skala typografii, spacing, buttony, badge, karty, inputy, ' +
      'dialogi, taby, toasty, ikony, avatary, status pill, empty/loading states.',
    status: 'ready',
  },
  {
    to: '/design/rules',
    icon: ShieldCheck,
    title: 'Reguly',
    subtitle: 'Kontrakt produktowy',
    desc:
      'Zasady wiazace wszystkie ekrany: max 1 orb na widok, wizualne vs tabelaryczne dodawanie, ' +
      'quick-add w pickerach, tabular numerals, 3 tryby kolorystyczne, brak emoji w kodzie.',
    status: 'planned',
  },
];

function StatusDot({ status }: { status: DesignCard['status'] }) {
  const map = {
    ready: { color: 'var(--ok)', label: 'Gotowe' },
    wip: { color: 'var(--wn)', label: 'W toku' },
    planned: { color: 'var(--tx3)', label: 'Planowane' },
  } as const;
  const m = map[status];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: m.color,
          boxShadow: `0 0 8px ${m.color}`,
        }}
      />
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {m.label}
      </span>
    </div>
  );
}

function DesignCardTile({ card, disabled }: { card: DesignCard; disabled: boolean }) {
  const Icon = card.icon;
  const inner = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 20,
        background: 'var(--sf)',
        border: '1px solid var(--bd)',
        borderRadius: 14,
        height: '100%',
        transition: 'all .18s ease',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = 'var(--bd-f)';
        e.currentTarget.style.boxShadow = '0 10px 30px var(--pri-glow)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--bd)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--pri), #7c3aed)',
            color: 'white',
            boxShadow: '0 6px 18px var(--pri-glow2)',
          }}
        >
          <Icon size={22} aria-hidden />
        </div>
        <StatusDot status={card.status} />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {card.subtitle}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginTop: 4 }}>{card.title}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.55, flex: 1 }}>{card.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--pri)' }}>
        {disabled ? 'Wkrotce' : 'Otworz'} <ArrowRight size={14} aria-hidden />
      </div>
    </div>
  );

  if (disabled) return <div>{inner}</div>;
  return (
    <Link to={card.to} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  );
}

export function DesignIndexPage() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 4px 48px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: 'var(--tx3)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
          Design System
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx)', margin: '6px 0 4px' }}>
          InfraDesk v2 — zrodlo prawdy
        </h1>
        <div style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 720, lineHeight: 1.55 }}>
          Jedna strona zbiera caly jezyk wizualny ekosystemu Silers AI. Zanim zaprojektujesz nowy ekran lub
          komponent — zajrzyj tutaj. Jesli czegos brakuje, dodaj w tym samym miejscu zamiast tworzyc rownolegla
          konwencje.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((c) => (
          <DesignCardTile key={c.to} card={c} disabled={c.status === 'planned'} />
        ))}
      </div>

      <div
        style={{
          marginTop: 40,
          padding: '14px 16px',
          background: 'var(--sf)',
          border: '1px dashed var(--bd)',
          borderRadius: 12,
          fontSize: 11,
          color: 'var(--tx3)',
          lineHeight: 1.6,
        }}
      >
        Uwaga: dokumentacja odzwierciedla aktualny stan komponentow. Zmiana wygladu musi trafic rownoczesnie
        do kodu komponentu (np. <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>@/components/ui/Button</code>)
        oraz do tej strony. Nie projektuj nowych wariantow w przestrzeni feature — dopisuj tutaj.
      </div>
    </div>
  );
}

export default DesignIndexPage;
