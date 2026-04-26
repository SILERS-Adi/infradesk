/**
 * IdCoreShowcasePage — canonical visual reference for "Rdzeń ID" (IrisCore).
 *
 * Route: /design/id-core  (inside AppShell)
 *
 * Purpose: single source of truth for how the orb should look across the entire
 * Silers AI ecosystem (V2 web, Asystent desktop, future Mariusz/Client agents).
 * When we need to tweak the look, we tweak IrisCore.tsx — this page renders
 * every variant so the visual contract is visible at a glance.
 */

import { IrisCore, type IrisSize, type IrisState, type IrisStatus } from '@/components/iris/IrisCore';

const SIZES: IrisSize[] = ['sm', 'md', 'lg', 'hero'];
const STATES: IrisState[] = ['idle', 'thinking', 'speaking', 'listening', 'error'];
const STATUSES: IrisStatus[] = ['ok', 'warning', 'critical', 'offline'];

const SIZE_PX: Record<IrisSize, number> = { sm: 28, md: 56, lg: 96, hero: 200 };

const SNIPPET_ROW1 = `import { IrisCore } from '@/components/iris/IrisCore';

<IrisCore size="sm"   state="idle" />
<IrisCore size="md"   state="idle" />
<IrisCore size="lg"   state="idle" />
<IrisCore size="hero" state="idle" />`;

const SNIPPET_ROW2 = `<IrisCore size="lg" state="idle"      />
<IrisCore size="lg" state="thinking"  />
<IrisCore size="lg" state="speaking"  />
<IrisCore size="lg" state="listening" />
<IrisCore size="lg" state="error"     />`;

const SNIPPET_ROW3 = `<IrisCore size="lg" status="ok"       score={72} />
<IrisCore size="lg" status="warning"  score={72} />
<IrisCore size="lg" status="critical" score={72} />
<IrisCore size="lg" status="offline"  score={72} />`;

function SectionTitle({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--tm)', textTransform: 'uppercase', fontWeight: 700 }}>
        Wariant {n}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 4, maxWidth: 680 }}>{desc}</div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      style={{
        fontSize: 11,
        lineHeight: 1.55,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        background: 'var(--sf)',
        border: '1px solid var(--bd)',
        borderRadius: 10,
        padding: '12px 14px',
        margin: '12px 0 0',
        color: 'var(--tx)',
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {code}
    </pre>
  );
}

function VariantCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        padding: 16,
        background: 'var(--sf)',
        border: '1px solid var(--bd)',
        borderRadius: 14,
        minHeight: 260,
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--tm)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function IdCoreShowcasePage() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 4px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: 'var(--tm)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
          Design System
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx)', margin: '6px 0 4px' }}>Rdzeń ID — IrisCore</h1>
        <div style={{ fontSize: 13, color: 'var(--tm)', maxWidth: 720, lineHeight: 1.55 }}>
          Kanoniczna wizualizacja Rdzenia ID używana w całym ekosystemie Silers AI: InfraDesk v2 (web),
          Asystent Business (desktop), Mariusz Agent (mobile), Client Agent. Jeden komponent — jeden wygląd.
          Używaj wyłącznie eksportu <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>IrisCore</code>
          z <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>@/components/iris/IrisCore</code>.
        </div>
      </div>

      {/* Guidelines */}
      <div
        style={{
          background: 'var(--sf)',
          border: '1px solid var(--bd)',
          borderRadius: 14,
          padding: '16px 18px',
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--tm)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
          Zasady użycia
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: 'var(--tx)' }}>
          <li>Maksymalnie <strong>1 orb na widok</strong> — to znak tożsamości, nie dekoracja.</li>
          <li><strong>Hero</strong> (200px) tylko na dashboard i pełnoekranowej diagnozie — nigdzie indziej.</li>
          <li><strong>Sm</strong> (28px) w topbarze / sidebarze — bez tekstu w środku.</li>
          <li><strong>Md / Lg</strong> — listy, panele boczne, puste stany.</li>
          <li>Wszystkie stany <code>idle · thinking · speaking · listening · error</code> mają to samo tempo (5.5s breath, 2.5s score pulse).</li>
          <li>Status <code>offline</code> wycisza animację — stosuj gdy brak danych / brak połączenia.</li>
          <li>Props <code>state</code> to alias legacy — preferuj <code>status</code> + <code>aiActive</code>.</li>
          <li>Nigdy nie wrzucaj orba bezpośrednio w tabele / listy — tam używaj mniejszych wskaźników statusu.</li>
        </ul>
      </div>

      {/* Row 1 — sizes */}
      <SectionTitle n={1} title="Rozmiary" desc="Cztery presety: sm (28), md (56), lg (96), hero (200). Stan: idle." />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {SIZES.map((s) => (
          <VariantCard key={s} label={`size="${s}" . ${SIZE_PX[s]}px`}>
            <IrisCore size={s} state="idle" />
          </VariantCard>
        ))}
      </div>
      <CodeBlock code={SNIPPET_ROW1} />

      {/* Row 2 — states */}
      <div style={{ marginTop: 40 }} />
      <SectionTitle
        n={2}
        title="Stany (legacy state alias)"
        desc="Pięć stanów animacji. Wewnętrznie mapują się na (aiActive, status). Rozmiar lg (96px)."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
        }}
      >
        {STATES.map((st) => (
          <VariantCard key={st} label={`state="${st}"`}>
            <IrisCore size="lg" state={st} />
          </VariantCard>
        ))}
      </div>
      <CodeBlock code={SNIPPET_ROW2} />

      {/* Row 3 — statuses with score */}
      <div style={{ marginTop: 40 }} />
      <SectionTitle
        n={3}
        title="Statusy + score"
        desc="Paleta kolorów wg status. Każdy z wartością score={72}. Offline wycisza animację i ukrywa score."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {STATUSES.map((st) => (
          <VariantCard key={st} label={`status="${st}" . score={72}`}>
            <IrisCore size="lg" status={st} score={72} />
          </VariantCard>
        ))}
      </div>
      <CodeBlock code={SNIPPET_ROW3} />

      {/* Footer note */}
      <div
        style={{
          marginTop: 40,
          padding: '14px 16px',
          background: 'var(--sf)',
          border: '1px dashed var(--bd)',
          borderRadius: 12,
          fontSize: 11,
          color: 'var(--tm)',
          lineHeight: 1.6,
        }}
      >
        Ta strona jest zrodlem prawdy. Nie dodawaj nowych wariantow bez synchronizacji z Asystent desktop
        (<code>ui/idcore.js</code>). Zmiana wygladu musi trafic do obu implementacji jednoczesnie.
      </div>
    </div>
  );
}

export default IdCoreShowcasePage;
