import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';

interface OnboardingSteps {
  company: boolean;
  location: boolean;
  device: boolean;
  agent: boolean;
  ticket: boolean;
}

interface Props {
  steps: OnboardingSteps;
  onDismiss: () => void;
}

const ITEMS = [
  { key: 'company', label: 'Uzupełnij dane firmy', link: '/my-company' },
  { key: 'location', label: 'Dodaj lokalizację', link: '/locations' },
  { key: 'device', label: 'Dodaj urządzenie', link: '/devices' },
  { key: 'agent', label: 'Zainstaluj agenta', link: '/downloads' },
  { key: 'ticket', label: 'Utwórz zgłoszenie', link: '/tickets' },
] as const;

export function OnboardingChecklist({ steps, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);

  const done = Object.values(steps).filter(Boolean).length;
  // Account creation is always done (+1)
  const total = ITEMS.length + 1;
  const completed = done + 1;
  const pct = Math.round((completed / total) * 100);

  if (completed >= total) return null; // All done — hide

  return (
    <div style={{
      margin: '8px 12px', borderRadius: 12, overflow: 'hidden',
      border: '1px solid var(--border)', background: 'var(--bg-card)',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #A78BFA)' }}>
            {completed}/{total}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tm)' }}>Konfiguracja</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          }}>
            <X className="h-3.5 w-3.5" style={{ color: 'var(--td)' }} />
          </button>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />
            : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />}
        </div>
      </button>

      {/* Progress bar */}
      <div style={{ padding: '0 14px 8px' }}>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--border)' }}>
          <div style={{
            height: '100%', borderRadius: 2, width: `${pct}%`,
            background: 'var(--accent, #6D28D9)', transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Items */}
      {expanded && (
        <div style={{ padding: '0 14px 10px' }}>
          {/* Account — always done */}
          <CheckItem done label="Utwórz konto" />
          {ITEMS.map(item => (
            <CheckItem
              key={item.key}
              done={steps[item.key as keyof OnboardingSteps]}
              label={item.label}
              link={item.link}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckItem({ done, label, link }: { done: boolean; label: string; link?: string }) {
  const content = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', fontSize: 12,
      color: done ? 'var(--td)' : 'var(--t)',
      textDecoration: done ? 'line-through' : 'none',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'rgba(16,185,129,0.15)' : 'var(--border)',
        border: done ? 'none' : '1px solid var(--border)',
      }}>
        {done && <Check className="h-3 w-3" style={{ color: '#10b981' }} />}
      </div>
      <span>{label}</span>
    </div>
  );

  if (!done && link) {
    return <Link to={link} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
}
