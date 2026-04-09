import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
  text: string;
  docsUrl?: string;
}

export function HelpTooltip({ text, docsUrl }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
      >
        <HelpCircle className="h-3.5 w-3.5" style={{ color: 'var(--td)', opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, padding: '10px 14px', borderRadius: 10, maxWidth: 280,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 100,
          fontSize: 12, lineHeight: 1.5, color: 'var(--ts)',
        }}>
          {text}
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 6, color: '#A78BFA', fontSize: 11, textDecoration: 'underline' }}>
              Dowiedz się więcej
            </a>
          )}
        </div>
      )}
    </div>
  );
}
