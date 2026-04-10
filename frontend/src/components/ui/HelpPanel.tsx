import { useState, useEffect, type ReactNode } from 'react';
import { HelpCircle, X, ChevronRight, Lightbulb, BookOpen, Zap } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   HelpPanel — rozwijany panel pomocy z ikonką (?)
   Profesjonalny, animowany, dla każdego użytkownika.
   ═══════════════════════════════════════════════════════════════════ */

export interface HelpSection {
  icon?: ReactNode;
  title: string;
  content: string;
}

export interface HelpPanelProps {
  /** Krótki opis strony w jednym zdaniu */
  description: string;
  /** Lista sekcji pomocy z ikonami */
  sections: HelpSection[];
  /** Opcjonalne wskazówki "pro-tip" */
  tips?: string[];
}

const STORAGE_KEY = 'infradesk_help_dismissed';

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

export function HelpPanel({ description, sections, tips }: HelpPanelProps) {
  const [open, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);

  // Subtle pulse animation on first visit
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const key = window.location.pathname;
    const dismissed = getDismissed();
    if (!dismissed.includes(key)) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  const toggle = () => {
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => setAnimate(true));
      // Mark as seen
      const key = window.location.pathname;
      const dismissed = getDismissed();
      if (!dismissed.includes(key)) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed, key])); } catch {}
      }
      setPulse(false);
    } else {
      setAnimate(false);
      setTimeout(() => setOpen(false), 250);
    }
  };

  return (
    <>
      {/* ── Trigger button ─────────────────────────────────────────── */}
      <button
        onClick={toggle}
        title="Pomoc — kliknij aby dowiedzieć się więcej"
        className="help-trigger"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 10,
          background: open ? 'rgba(139,92,246,0.15)' : 'var(--hover-bg)',
          border: `1px solid ${open ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
          color: open ? '#A78BFA' : 'var(--tm)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s ease',
          animation: pulse ? 'helpPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        {open ? <X size={14} /> : <HelpCircle size={14} />}
        {open ? 'Zamknij pomoc' : 'Pomoc'}
      </button>

      {/* ── Panel ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className="help-panel"
          style={{
            marginTop: 12,
            borderRadius: 16,
            overflow: 'hidden',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(139,92,246,0.08)',
            opacity: animate ? 1 : 0,
            transform: animate ? 'translateY(0)' : 'translateY(-8px)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.05))',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #5B5FEF, #8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>
                Jak korzystać z tej strony?
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ts)', margin: 0 }}>
                {description}
              </p>
            </div>
          </div>

          {/* Sections */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: sections.length > 3 ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr',
              gap: 8,
            }}>
              {sections.map((section, i) => (
                <HelpSectionCard key={i} section={section} index={i} />
              ))}
            </div>
          </div>

          {/* Tips */}
          {tips && tips.length > 0 && (
            <div style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--border)',
              background: 'rgba(250,204,21,0.03)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: '#FBBF24',
              }}>
                <Lightbulb size={13} /> Wskazówki
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tips.map((tip, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 11, lineHeight: 1.5, color: 'var(--ts)',
                  }}>
                    <Zap size={11} style={{ marginTop: 3, flexShrink: 0, color: '#FBBF24' }} />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pulse keyframe */}
      <style>{`
        @keyframes helpPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
          50% { box-shadow: 0 0 0 6px rgba(139,92,246,0.15); }
        }
      `}</style>
    </>
  );
}

/* ── Section card ──────────────────────────────────────────────────── */

function HelpSectionCard({ section, index }: { section: HelpSection; index: number }) {
  const [expanded, setExpanded] = useState(index < 3); // First 3 auto-expanded

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: expanded ? 'rgba(139,92,246,0.03)' : 'transparent',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '10px 14px',
          background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'rgba(139,92,246,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#A78BFA', fontSize: 14,
        }}>
          {section.icon ?? <span style={{ fontSize: 12, fontWeight: 800 }}>{index + 1}</span>}
        </div>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>
          {section.title}
        </span>
        <ChevronRight
          size={14}
          style={{
            color: 'var(--tm)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>
      {expanded && (
        <div style={{
          padding: '0 14px 12px 52px',
          fontSize: 12, lineHeight: 1.7, color: 'var(--ts)',
        }}>
          {section.content}
        </div>
      )}
    </div>
  );
}
