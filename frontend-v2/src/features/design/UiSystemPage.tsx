/**
 * UiSystemPage — comprehensive visual reference for the InfraDesk V2 UI system.
 *
 * Route: /design/ui  (inside AppShell)
 *
 * This page documents the ENTIRE visual language of InfraDesk V2: tokens,
 * typography, spacing, buttons, badges, cards, inputs, dialogs, tabs,
 * empty/loading states, toasts, icons, avatars, status pills, and the
 * product rules that keep every screen consistent.
 *
 * Rules for maintenance:
 * - Each subsection is a named exported subcomponent (easier to navigate).
 * - Use the REAL components from @/components/ui — never reimplement.
 * - Render examples with their source snippet directly below.
 * - When a component changes, update the snippet here too.
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Trash, Search, Check, X, AlertTriangle, Info, Settings as Cog,
  User as UserIcon, Home, Download, Loader2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { ViewToggle, type ViewMode } from '@/components/ui/ViewToggle';
import { StatusPill } from '@/components/ui/StatusPill';

/* ══════════════════════════════════════════════════════════════
   Shared primitives (kept local to this page — layout only)
   ══════════════════════════════════════════════════════════════ */

function Section({
  id,
  eyebrow,
  title,
  desc,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: 48 }}>
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            color: 'var(--tx3)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {eyebrow}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', margin: '4px 0 6px' }}>{title}</h2>
        <div style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 760, lineHeight: 1.55 }}>{desc}</div>
      </div>
      {children}
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      style={{
        fontSize: 11,
        lineHeight: 1.6,
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

function DemoRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        padding: 16,
        background: 'var(--sf)',
        border: '1px solid var(--bd)',
        borderRadius: 14,
      }}
    >
      {children}
    </div>
  );
}

function DemoGrid({
  cols = 3,
  children,
}: {
  cols?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   A. Colors — forced light + dark side-by-side
   ══════════════════════════════════════════════════════════════ */

const COLOR_GROUPS: Array<{ title: string; tokens: Array<{ name: string; hexLight: string; hexDark: string }> }> = [
  {
    title: 'Surfaces',
    tokens: [
      { name: '--bg', hexLight: '#f0f2f5', hexDark: '#0b101b' },
      { name: '--sf', hexLight: '#ffffff', hexDark: '#151c2c' },
      { name: '--sf2', hexLight: '#f8f9fb', hexDark: '#111827' },
      { name: '--sf-h', hexLight: '#f3f4f6', hexDark: '#1c2536' },
    ],
  },
  {
    title: 'Borders',
    tokens: [
      { name: '--bd', hexLight: '#e5e7eb', hexDark: '#1f2937' },
      { name: '--bd-l', hexLight: '#f3f4f6', hexDark: '#1c2536' },
      { name: '--bd-f', hexLight: '#6366f1', hexDark: '#818cf8' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { name: '--tx', hexLight: '#111827', hexDark: '#f3f4f6' },
      { name: '--tx2', hexLight: '#4b5563', hexDark: '#9ca3af' },
      { name: '--tx3', hexLight: '#9ca3af', hexDark: '#6b7280' },
    ],
  },
  {
    title: 'Accents',
    tokens: [
      { name: '--pri', hexLight: '#6366f1', hexDark: '#818cf8' },
      { name: '--in', hexLight: '#3b82f6', hexDark: '#60a5fa' },
      { name: '--ok', hexLight: '#10b981', hexDark: '#34d399' },
      { name: '--er', hexLight: '#ef4444', hexDark: '#f87171' },
      { name: '--wn', hexLight: '#f59e0b', hexDark: '#fbbf24' },
    ],
  },
];

function Swatch({ name, hex, borderToken }: { name: string; hex: string; borderToken?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'var(--sf2)',
        border: '1px solid var(--bd)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: borderToken ? 'var(--sf2)' : hex,
          border: borderToken ? `2px solid ${hex}` : '1px solid rgba(0,0,0,.08)',
          flexShrink: 0,
        }}
      />
      <div style={{ lineHeight: 1.25 }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: 'var(--tx)',
            fontWeight: 600,
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: "'JetBrains Mono', monospace" }}>{hex}</div>
      </div>
    </div>
  );
}

function ThemeFrame({
  theme,
  children,
}: {
  theme: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      style={{
        background: 'var(--bg)',
        color: 'var(--tx)',
        borderRadius: 14,
        border: '1px solid var(--bd)',
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          color: 'var(--tx3)',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        data-theme=&quot;{theme}&quot;
      </div>
      {children}
    </div>
  );
}

export function ColorsSection() {
  const swatchList = (mode: 'light' | 'dark') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {COLOR_GROUPS.map((g) => (
        <div key={g.title}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            {g.title}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 8,
            }}
          >
            {g.tokens.map((t) => (
              <Swatch
                key={t.name}
                name={t.name}
                hex={mode === 'light' ? t.hexLight : t.hexDark}
                borderToken={g.title === 'Borders'}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Section
      id="colors"
      eyebrow="A. Kolory"
      title="Tokeny CSS — tryby light i dark"
      desc="Wszystkie kolory pochodza z tokenow w src/styles/tokens.css. Nigdy nie hardcode'uj wartosci hex w komponentach — uzywaj var(--token). Ponizej ten sam zestaw wymuszony przez data-theme."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ThemeFrame theme="light">{swatchList('light')}</ThemeFrame>
        <ThemeFrame theme="dark">{swatchList('dark')}</ThemeFrame>
      </div>
      <CodeBlock
        code={`/* tokens.css — activation */
document.documentElement.dataset.theme = 'light' | 'dark' | 'auto';

/* usage */
<div style={{ background: 'var(--sf)', color: 'var(--tx)' }} />`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   B. Typography
   ══════════════════════════════════════════════════════════════ */

export function TypographySection() {
  return (
    <Section
      id="typography"
      eyebrow="B. Typografia"
      title="Skala tekstu i rodziny czcionek"
      desc="Sans: systemowe + Inter. Mono: JetBrains Mono. Liczby w tabelach i statystykach zawsze tabular-nums."
    >
      <Card>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx)', lineHeight: 1.2 }}>
              h1 — 28px / 800 · Naglowek strony
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.25 }}>
              h2 — 22px / 600 · Naglowek sekcji
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)' }}>h3 — 18px / 600 · Podsekcja</div>
            <div style={{ fontSize: 14, color: 'var(--tx)' }}>
              body — 14px / 400 · Podstawowy tekst aplikacji, uzywany wewnatrz kart i formularzy.
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>small — 12px / 400 · Opisy, meta, podpisy.</div>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: 'var(--tx2)' }}>
              mono — 11px · kod, ID techniczne, tokeny
            </div>
            <div
              style={{
                fontSize: 14,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--tx)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              Liczby tabularne: 1 234 567,89 · 0000-0042
            </div>
          </div>
        </CardContent>
      </Card>
      <CodeBlock
        code={`/* Rodziny */
sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
mono: 'JetBrains Mono', ui-monospace, monospace;

/* Liczby w tabelach i statystykach */
style={{ fontVariantNumeric: 'tabular-nums' }}`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   C. Spacing
   ══════════════════════════════════════════════════════════════ */

const SPACING = [
  { name: '--sp-1', px: 4 },
  { name: '--sp-2', px: 8 },
  { name: '--sp-3', px: 12 },
  { name: '--sp-4', px: 16 },
  { name: '--sp-5', px: 24 },
  { name: '--sp-6', px: 32 },
  { name: '--sp-7', px: 48 },
];

export function SpacingSection() {
  return (
    <Section
      id="spacing"
      eyebrow="C. Spacing"
      title="Skala odstepow 4 / 8 / 12 / 16 / 24 / 32 / 48"
      desc="Wszystkie wartosci paddingu, gapu i marginesow pochodza z tej skali. Inne wartosci wymagaja uzasadnienia."
    >
      <Card>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SPACING.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--tx2)',
                    width: 80,
                  }}
                >
                  {s.name}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tx3)', width: 48 }}>
                  {s.px}px
                </div>
                <div
                  style={{
                    height: 14,
                    width: s.px * 4,
                    background: 'linear-gradient(135deg, var(--pri), #7c3aed)',
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   D. Buttons
   ══════════════════════════════════════════════════════════════ */

export function ButtonsSection() {
  return (
    <Section
      id="buttons"
      eyebrow="D. Buttony"
      title="Warianty, rozmiary, stany"
      desc="Zawsze uzywaj @/components/ui/Button. Warianty: primary (default), outline, ghost, danger, success. Rozmiary sm/md/lg. Primary ma gradient i glow — nie replikuj recznie."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DemoRow>
          <Button variant="primary">Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
        </DemoRow>
        <DemoRow>
          <Button size="sm">Mala</Button>
          <Button size="md">Srednia</Button>
          <Button size="lg">Duza</Button>
        </DemoRow>
        <DemoRow>
          <Button>
            <Plus size={14} /> Dodaj
          </Button>
          <Button variant="outline">
            <Pencil size={14} /> Edytuj
          </Button>
          <Button variant="danger">
            <Trash size={14} /> Usun
          </Button>
          <Button disabled>
            <Check size={14} /> Disabled
          </Button>
          <Button disabled>
            <Loader2 size={14} className="animate-spin" /> Ladowanie
          </Button>
        </DemoRow>
      </div>
      <CodeBlock
        code={`import { Button } from '@/components/ui/Button';

<Button variant="primary" size="md">
  <Plus size={14} /> Dodaj
</Button>

<Button variant="outline" disabled>Disabled</Button>
<Button variant="danger"><Trash size={14} /> Usun</Button>`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   E. Badges
   ══════════════════════════════════════════════════════════════ */

export function BadgesSection() {
  return (
    <Section
      id="badges"
      eyebrow="E. Badge"
      title="Etykiety statusu i meta"
      desc="Zawsze uzywaj @/components/ui/Badge. Warianty: neutral, accent, info, success, warning, danger. Badge jest male z zalozenia — nie skaluj typografii."
    >
      <DemoRow>
        <Badge variant="neutral">neutral</Badge>
        <Badge variant="accent">accent</Badge>
        <Badge variant="info">info</Badge>
        <Badge variant="success">success</Badge>
        <Badge variant="warning">warning</Badge>
        <Badge variant="danger">danger</Badge>
      </DemoRow>
      <CodeBlock
        code={`import { Badge } from '@/components/ui/Badge';

<Badge variant="success">Aktywny</Badge>
<Badge variant="warning">Oczekuje</Badge>
<Badge variant="danger">Awaria</Badge>`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   F. Cards
   ══════════════════════════════════════════════════════════════ */

export function CardsSection() {
  return (
    <Section
      id="cards"
      eyebrow="F. Karty"
      title="Card + CardHeader + CardContent"
      desc="Podstawowy kontener tresci. Zawsze border + radius z tokenow. Unikaj custom paddingow — uzywaj CardContent."
    >
      <DemoGrid cols={3}>
        <Card>
          <CardContent>
            <div style={{ fontSize: 13, color: 'var(--tx)', fontWeight: 600 }}>Karta podstawowa</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4 }}>Tylko CardContent.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Karta z headerem</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>Naglowek + tresc oddzielone linia.</div>
          </CardContent>
        </Card>
        <Card
          style={{ boxShadow: 'var(--sh3)', transition: 'all .18s ease' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--sh4)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--sh3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <CardContent>
            <div style={{ fontSize: 13, color: 'var(--tx)', fontWeight: 600 }}>Elevated + hover</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4 }}>Uzyj na dashboardzie / tile gridach.</div>
          </CardContent>
        </Card>
      </DemoGrid>
      <CodeBlock
        code={`import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

<Card>
  <CardHeader><CardTitle>Tytul</CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   G. Inputs
   ══════════════════════════════════════════════════════════════ */

function FieldLabel({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <label
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: error ? 'var(--er)' : 'var(--tx2)',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        display: 'block',
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

export function InputsSection() {
  return (
    <Section
      id="inputs"
      eyebrow="G. Input / Textarea"
      title="Pola formularza"
      desc="Wysokosc 40px (md), radius --r-s, border --bd, focus ring --pri-glow. Prefix icon — wrapper flex z ikona 16px przed inputem."
    >
      <DemoGrid cols={2}>
        <div>
          <FieldLabel>Tekst</FieldLabel>
          <Input placeholder="np. Jan Kowalski" />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" placeholder="nazwa@firma.pl" />
        </div>
        <div>
          <FieldLabel>Haslo</FieldLabel>
          <Input type="password" placeholder="********" />
        </div>
        <div>
          <FieldLabel>Liczba (tabular)</FieldLabel>
          <Input type="number" placeholder="42" style={{ fontVariantNumeric: 'tabular-nums' }} />
        </div>
        <div>
          <FieldLabel>Search z ikona prefix</FieldLabel>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }}
              aria-hidden
            />
            <Input placeholder="Szukaj..." style={{ paddingLeft: 32 }} />
          </div>
        </div>
        <div>
          <FieldLabel error>Error state</FieldLabel>
          <Input
            defaultValue="niepoprawny@"
            style={{ borderColor: 'var(--er)', boxShadow: '0 0 0 3px var(--er-l)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--er)', marginTop: 4 }}>Niepoprawny format email.</div>
        </div>
      </DemoGrid>
      <div style={{ marginTop: 12 }}>
        <FieldLabel>Textarea</FieldLabel>
        <Textarea placeholder="Opis zgloszenia..." rows={3} />
      </div>
      <CodeBlock
        code={`import { Input, Textarea } from '@/components/ui/Input';

<Input type="email" placeholder="nazwa@firma.pl" />
<Input style={{ borderColor: 'var(--er)' }} />  // error
<Textarea rows={4} />`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   H. Select
   ══════════════════════════════════════════════════════════════ */

export function SelectSection() {
  const [multi, setMulti] = useState<string[]>(['OPEN', 'IN_PROGRESS']);
  const toggle = (v: string) =>
    setMulti((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  const OPTS = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

  return (
    <Section
      id="select"
      eyebrow="H. Select"
      title="Wybor wartosci"
      desc="Dla pojedynczego wyboru — styled Select z @/components/ui/Input. Dla multi-select pattern: pigulki z toggle (ponizej)."
    >
      <DemoGrid cols={2}>
        <div>
          <FieldLabel>Native + styled</FieldLabel>
          <Select defaultValue="OPEN">
            {OPTS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>Multi (toggle pigulki)</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OPTS.map((o) => {
              const active = multi.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    border: `1px solid ${active ? 'var(--bd-f)' : 'var(--bd)'}`,
                    background: active ? 'var(--pri-l)' : 'var(--sf2)',
                    color: active ? 'var(--pri)' : 'var(--tx2)',
                    cursor: 'pointer',
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
            Wybrano: {multi.length} / {OPTS.length}
          </div>
        </div>
      </DemoGrid>
      <CodeBlock
        code={`import { Select } from '@/components/ui/Input';

<Select defaultValue="OPEN">
  <option value="NEW">Nowe</option>
  <option value="OPEN">Otwarte</option>
</Select>`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   I. Dialog / Modal
   ══════════════════════════════════════════════════════════════ */

export function DialogSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <Section
      id="dialog"
      eyebrow="I. Dialog / Modal"
      title="Radix Dialog — standard i confirm"
      desc="Dla wizualnych akcji uzywamy Radix Dialog. Formularze pelnoekranowe (np. nowy zgloszenie tabelarycznie) uzywaja dedykowanych stron /xxx/new — nie modala. Potwierdzenia akcji destruktywnych zawsze przez confirm dialog."
    >
      <DemoRow>
        <Button onClick={() => setOpen(true)}>Otworz modal</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash size={14} /> Confirm delete
        </Button>
      </DemoRow>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 60,
              width: 'min(520px, 92vw)',
              background: 'var(--sf)',
              border: '1px solid var(--bd)',
              borderRadius: 'var(--r)',
              boxShadow: 'var(--sh4)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Dialog.Title style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>
                Przykladowy modal
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  style={{
                    padding: 4,
                    borderRadius: 6,
                    color: 'var(--tx3)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5 }}>
                Wizualne dodawanie = modal. Tabelaryczne = pelna strona /xxx/new. Reguly w sekcji Q.
              </div>
            </div>
            <div
              style={{
                padding: 14,
                borderTop: '1px solid var(--bd)',
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                background: 'var(--sf2)',
              }}
            >
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={() => setOpen(false)}>Zapisz</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 60,
              width: 'min(420px, 92vw)',
              background: 'var(--sf)',
              border: '1px solid var(--bd)',
              borderRadius: 'var(--r)',
              boxShadow: 'var(--sh4)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 18, display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--er-l)',
                  border: '1px solid var(--er-b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={18} color="var(--er)" />
              </div>
              <div>
                <Dialog.Title style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>
                  Na pewno usunac?
                </Dialog.Title>
                <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4, lineHeight: 1.5 }}>
                  Tej operacji nie mozna cofnac. Wszystkie powiazane dane zostana usuniete.
                </div>
              </div>
            </div>
            <div
              style={{
                padding: 14,
                borderTop: '1px solid var(--bd)',
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                background: 'var(--sf2)',
              }}
            >
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Anuluj
              </Button>
              <Button variant="danger" onClick={() => setConfirm(false)}>
                Usun
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CodeBlock
        code={`import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
    <Dialog.Content style={{ /* center + var(--sf) */ }}>
      <Dialog.Title>...</Dialog.Title>
      ...
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   J. Tabs + ViewToggle
   ══════════════════════════════════════════════════════════════ */

export function TabsSection() {
  const [tab, setTab] = useState<'nowe' | 'w_toku' | 'zamkniete' | 'anulowane'>('nowe');
  const [view, setView] = useState<ViewMode>('visual');

  const tabs: Array<{ id: typeof tab; label: string; count: number }> = [
    { id: 'nowe', label: 'Nowe', count: 12 },
    { id: 'w_toku', label: 'W toku', count: 7 },
    { id: 'zamkniete', label: 'Zamkniete', count: 142 },
    { id: 'anulowane', label: 'Anulowane', count: 3 },
  ];

  return (
    <Section
      id="tabs"
      eyebrow="J. Tabs + ViewToggle"
      title="Nawigacja w obrebie strony"
      desc="Tabs: podzial tresci w tym samym ekranie (np. 4 statusy ticketow). ViewToggle: wizualne vs tabelaryczne — zapamietywane per-ekran przez useViewPreference."
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            borderBottom: '1px solid var(--bd)',
            gap: 2,
          }}
        >
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: active ? 'var(--pri)' : 'var(--tx2)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--pri)' : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {t.label}
                <span
                  style={{
                    fontSize: 10,
                    background: active ? 'var(--pri-l)' : 'var(--sf-h)',
                    color: active ? 'var(--pri)' : 'var(--tx3)',
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 16,
          background: 'var(--sf)',
          border: '1px solid var(--bd)',
          borderRadius: 14,
          fontSize: 12,
          color: 'var(--tx2)',
        }}
      >
        Aktywna zakladka: <strong style={{ color: 'var(--tx)' }}>{tab}</strong> · Widok:{' '}
        <strong style={{ color: 'var(--tx)' }}>{view}</strong>. Kazda lista w produkcie trzyma ten sam kontrakt.
      </div>
      <CodeBlock
        code={`import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';

const [view, setView] = useViewPreference('tickets', 'visual');
<ViewToggle value={view} onChange={setView} />`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   K. Empty State
   ══════════════════════════════════════════════════════════════ */

export function EmptySection() {
  return (
    <Section
      id="empty"
      eyebrow="K. Empty state"
      title="Brak danych"
      desc="Icon w kole + tytul + jedna linijka opisu + jeden primary CTA. Nigdy nie pokazuj pustej listy bez kontekstu i kolejnego kroku."
    >
      <Card>
        <CardContent>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '32px 16px',
              textAlign: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'var(--pri-l)',
                border: '1px solid var(--bd-f)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Info size={24} color="var(--pri)" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Brak zgloszen w tym widoku</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 360 }}>
              Kiedy klient wysle pierwsze zgloszenie — pojawi sie tutaj. Mozesz tez dodac je recznie.
            </div>
            <Button>
              <Plus size={14} /> Nowe zgloszenie
            </Button>
          </div>
        </CardContent>
      </Card>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   L. Loading
   ══════════════════════════════════════════════════════════════ */

export function LoadingSection() {
  return (
    <Section
      id="loading"
      eyebrow="L. Loading states"
      title="Skeleton, spinner, progress"
      desc="Nie pokazuj pustych kontenerow podczas fetch. Uzywaj SkeletonCard w gridach i tabel, spinnera inline w buttonie, paska progres przy uploadach."
    >
      <DemoGrid cols={3}>
        <SkeletonCard />
        <Card>
          <CardContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton style={{ height: 16, width: '70%' }} />
              <Skeleton style={{ height: 12, width: '40%' }} />
              <Skeleton style={{ height: 80, width: '100%' }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--tx2)' }}>
                <Loader2 size={14} className="animate-spin" /> Ladowanie danych...
              </div>
              <div>
                <div
                  style={{
                    height: 6,
                    background: 'var(--sf-h)',
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: '62%',
                      background: 'linear-gradient(135deg, var(--pri), #7c3aed)',
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--tx3)',
                    marginTop: 4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  62% — upload pliku
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </DemoGrid>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   M. Toasts
   ══════════════════════════════════════════════════════════════ */

export function ToastsSection() {
  return (
    <Section
      id="toasts"
      eyebrow="M. Toasty"
      title="react-hot-toast"
      desc="Toaster siedzi globalnie w App.tsx (top-right). Uzywaj toast.success / toast.error / toast.loading — nie wynajduj custom notyfikacji."
    >
      <DemoRow>
        <Button variant="success" onClick={() => toast.success('Zapisano zmiany')}>
          <Check size={14} /> Success
        </Button>
        <Button variant="danger" onClick={() => toast.error('Nie udalo sie polaczyc')}>
          <X size={14} /> Error
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const id = toast.loading('Synchronizacja...');
            setTimeout(() => toast.success('Gotowe', { id }), 1400);
          }}
        >
          <Loader2 size={14} /> Loading -&gt; Success
        </Button>
      </DemoRow>
      <CodeBlock
        code={`import toast from 'react-hot-toast';

toast.success('Zapisano zmiany');
toast.error('Nie udalo sie polaczyc');
const id = toast.loading('Synchronizacja...');
toast.success('Gotowe', { id });  // promote`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   N. Icons
   ══════════════════════════════════════════════════════════════ */

const ICONS: Array<{ name: string; Cmp: typeof Plus }> = [
  { name: 'Plus', Cmp: Plus },
  { name: 'Pencil', Cmp: Pencil },
  { name: 'Trash', Cmp: Trash },
  { name: 'Search', Cmp: Search },
  { name: 'Check', Cmp: Check },
  { name: 'X', Cmp: X },
  { name: 'AlertTriangle', Cmp: AlertTriangle },
  { name: 'Info', Cmp: Info },
  { name: 'Settings', Cmp: Cog },
  { name: 'User', Cmp: UserIcon },
  { name: 'Home', Cmp: Home },
  { name: 'Download', Cmp: Download },
];

export function IconsSection() {
  return (
    <Section
      id="icons"
      eyebrow="N. Ikony"
      title="lucide-react"
      desc="Referencja: lucide.dev/icons. Rozmiary: 14 (w buttonach), 16 (standalone), 20 (big action). Nie mieszaj innych bibliotek — jedna linia == jeden zestaw."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 8,
        }}
      >
        {ICONS.map(({ name, Cmp }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--sf)',
              border: '1px solid var(--bd)',
              borderRadius: 10,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--tx2)',
            }}
          >
            <Cmp size={16} color="var(--pri)" aria-hidden />
            {name}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--tx3)' }}>
          <Plus size={14} /> size=14 (button)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--tx3)' }}>
          <Plus size={16} /> size=16 (standalone)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--tx3)' }}>
          <Plus size={20} /> size=20 (big action)
        </div>
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   O. Avatar
   ══════════════════════════════════════════════════════════════ */

const AVATAR_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function Avatar({
  name,
  email,
  size = 'md',
}: {
  name: string;
  email: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'sm' ? 28 : size === 'md' ? 40 : 56;
  const font = size === 'sm' ? 10 : size === 'md' ? 13 : 18;
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: 999,
        background: avatarColor(email),
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: font,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function AvatarSection() {
  const users = [
    { name: 'Adrian Silers', email: 'adrian@silers.pl' },
    { name: 'Mariusz Nowak', email: 'mariusz@silers.pl' },
    { name: 'Kamil Wisniewski', email: 'kamil@klient.pl' },
    { name: 'Anna Kowalska', email: 'anna@firma.com' },
    { name: 'Pawel Raro', email: 'pawel@pawelraro.pl' },
  ];
  return (
    <Section
      id="avatar"
      eyebrow="O. Avatar"
      title="User + client"
      desc="Kolor pobierany jest deterministycznie z hash emaila (8 kolorow). Jesli user ma avatarUrl — pokaz zdjecie, w fallbacku inicjaly. Rozmiary sm 28 / md 40 / lg 56."
    >
      <DemoRow>
        {users.slice(0, 3).map((u) => (
          <Avatar key={u.email} name={u.name} email={u.email} size="sm" />
        ))}
        <div style={{ width: 12 }} />
        {users.map((u) => (
          <Avatar key={`m-${u.email}`} name={u.name} email={u.email} size="md" />
        ))}
        <div style={{ width: 12 }} />
        {users.slice(0, 3).map((u) => (
          <Avatar key={`l-${u.email}`} name={u.name} email={u.email} size="lg" />
        ))}
      </DemoRow>
      <CodeBlock
        code={`function avatarColor(email: string): string {
  const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
                  '#EF4444', '#EC4899', '#06B6D4', '#6366F1'];
  let hash = 0;
  for (let i = 0; i < email.length; i++)
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length]!;
}`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   P. Status Pills
   ══════════════════════════════════════════════════════════════ */

export function StatusPillsSection() {
  return (
    <Section
      id="status"
      eyebrow="P. Status pills"
      title="StatusPill — ticket, task, order, delegation"
      desc="StatusPill mapuje wartosc enumu (NEW, OPEN, IN_PROGRESS...) na etykiete po polsku + wariant koloru. Zawsze uzywaj tego komponentu — nie maluj statusow recznie."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            Ticket
          </div>
          <DemoRow>
            {['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED'].map((s) => (
              <StatusPill key={s} entity="ticket" value={s} />
            ))}
          </DemoRow>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            Task
          </div>
          <DemoRow>
            {['NEW', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => (
              <StatusPill key={s} entity="task" value={s} />
            ))}
          </DemoRow>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            Order
          </div>
          <DemoRow>
            {['DRAFT', 'QUOTE_SENT', 'APPROVED', 'ORDERED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED'].map((s) => (
              <StatusPill key={s} entity="order" value={s} />
            ))}
          </DemoRow>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--tx3)',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 6,
          }}
        >
          Paski 4-zakladkowe (standard list)
        </div>
        <div
          style={{
            display: 'inline-flex',
            borderBottom: '1px solid var(--bd)',
          }}
        >
          {[
            { id: 'nowe', label: 'Nowe', count: 12 },
            { id: 'w_toku', label: 'W toku', count: 7 },
            { id: 'zamkniete', label: 'Zamkniete', count: 142 },
            { id: 'anulowane', label: 'Anulowane', count: 3 },
          ].map((t, i) => (
            <div
              key={t.id}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: i === 0 ? 'var(--pri)' : 'var(--tx2)',
                borderBottom: `2px solid ${i === 0 ? 'var(--pri)' : 'transparent'}`,
                marginBottom: -1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: 10,
                  background: i === 0 ? 'var(--pri-l)' : 'var(--sf-h)',
                  color: i === 0 ? 'var(--pri)' : 'var(--tx3)',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </div>
      <CodeBlock
        code={`import { StatusPill } from '@/components/ui/StatusPill';

<StatusPill entity="ticket" value="IN_PROGRESS" />
<StatusPill entity="order"  value="DELIVERED" />`}
      />
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   Q. Rules
   ══════════════════════════════════════════════════════════════ */

const RULES: Array<{ title: string; body: string; link?: { to: string; label: string } }> = [
  {
    title: 'Maks. 1 orb IrisCore na widok',
    body:
      'Rdzen ID jest fokusem wizualnym — jesli pojawia sie wiecej niz jeden orb na ekranie, user nie wie w co patrzy. Drugi orb zawsze jako mniejsza sygnatura, nigdy jako dwa "hero".',
    link: { to: '/design/id-core', label: 'Zobacz Rdzen ID' },
  },
  {
    title: 'Wizualne = modal, tabelaryczne = strona /xxx/new',
    body:
      'Dodawanie wizualnie (wizard, karta, drag-and-drop) otwieraj w Dialog. Dodawanie tabelaryczne (pelny formularz z wieloma polami) — osobna strona /xxx/new. Nie mieszaj tych trybow.',
  },
  {
    title: 'Dark / light / auto — trzy tryby obowiazkowe',
    body:
      'Kazda apka w ekosystemie ma 3 tryby kolorystyczne. Implementacja przez var(--token) + data-theme. Nie hardcode wartosci hex w komponentach.',
  },
  {
    title: 'Quick-add w pickerach',
    body:
      'Kazdy picker (firma / lokalizacja / urzadzenie / kontakt / technik) MUSI miec inline "+ dodaj nowe" bez wychodzenia z kreatora. Inaczej user musi porzucic formularz, wrocic i zaczac od nowa.',
  },
  {
    title: 'Numery w kolumnach — tabular-nums',
    body:
      'Wszystkie liczby w tabelach, statystykach i id-technicznych uzywaja fontVariantNumeric: "tabular-nums". Rozne szerokosci cyfr lamia wzrokowa kolumnowosc.',
  },
  {
    title: 'Nie uzywamy emoji w kodzie',
    body:
      'User rule Adriana. Ikony wylacznie z lucide-react. Emoji tylko jezeli przychodza z contentu usera (np. nazwy firm, wiadomosci czatu).',
  },
];

export function RulesSection() {
  return (
    <Section
      id="rules"
      eyebrow="Q. Reguly"
      title="Kontrakt produktowy V2"
      desc="Zasady wiazace wszystkie ekrany i apki w ekosystemie. Zlamanie reguly wymaga swiadomej decyzji — nie domyslnie."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {RULES.map((r, i) => (
          <Card key={r.title}>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, var(--pri), #7c3aed)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{r.title}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.55 }}>{r.body}</div>
                {r.link && (
                  <a
                    href={r.link.to}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--pri)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {r.link.label} <ChevronRight size={14} />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════
   Layout — table of contents + header + sections
   ══════════════════════════════════════════════════════════════ */

const TOC: Array<{ id: string; label: string }> = [
  { id: 'colors', label: 'A. Kolory' },
  { id: 'typography', label: 'B. Typografia' },
  { id: 'spacing', label: 'C. Spacing' },
  { id: 'buttons', label: 'D. Buttony' },
  { id: 'badges', label: 'E. Badge' },
  { id: 'cards', label: 'F. Karty' },
  { id: 'inputs', label: 'G. Inputy' },
  { id: 'select', label: 'H. Select' },
  { id: 'dialog', label: 'I. Dialog' },
  { id: 'tabs', label: 'J. Tabs' },
  { id: 'empty', label: 'K. Empty state' },
  { id: 'loading', label: 'L. Loading' },
  { id: 'toasts', label: 'M. Toasty' },
  { id: 'icons', label: 'N. Ikony' },
  { id: 'avatar', label: 'O. Avatar' },
  { id: 'status', label: 'P. Status pills' },
  { id: 'rules', label: 'Q. Reguly' },
];

export function UiSystemPage() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 4px 64px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--tx3)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Design System · /design/ui
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx)', margin: '6px 0 4px' }}>
          System UI — InfraDesk v2
        </h1>
        <div style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 760, lineHeight: 1.55 }}>
          Kompletna referencja wygladu V2: tokeny, typografia, spacing, komponenty, stany i reguly. Zanim dodasz
          nowy wariant w przestrzeni feature — sprawdz tutaj. Zmiana wygladu idzie rownoczesnie do komponentu
          i do tej strony.
        </div>
      </div>

      {/* Table of contents */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 12,
          background: 'var(--sf)',
          border: '1px solid var(--bd)',
          borderRadius: 14,
          marginBottom: 8,
        }}
      >
        {TOC.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--tx2)',
              background: 'var(--sf2)',
              border: '1px solid var(--bd)',
              textDecoration: 'none',
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <ColorsSection />
      <TypographySection />
      <SpacingSection />
      <ButtonsSection />
      <BadgesSection />
      <CardsSection />
      <InputsSection />
      <SelectSection />
      <DialogSection />
      <TabsSection />
      <EmptySection />
      <LoadingSection />
      <ToastsSection />
      <IconsSection />
      <AvatarSection />
      <StatusPillsSection />
      <RulesSection />

      <div
        style={{
          marginTop: 48,
          padding: '14px 16px',
          background: 'var(--sf)',
          border: '1px dashed var(--bd)',
          borderRadius: 12,
          fontSize: 11,
          color: 'var(--tx3)',
          lineHeight: 1.6,
        }}
      >
        Ta strona jest zywa dokumentacja — pracuje na prawdziwych komponentach z @/components/ui. Jesli cos
        wyglada tutaj inaczej niz na ekranie produkcyjnym, to ekran produkcyjny lamie kontrakt. Napraw ekran,
        nie dokumentacje.
      </div>
    </div>
  );
}

export default UiSystemPage;
