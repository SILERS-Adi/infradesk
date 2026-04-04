import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: ReactNode;
  noPadding?: boolean;
}

const sizeMap = { sm: 380, md: 440, lg: 520, xl: 600, '2xl': 680, '3xl': 820, full: 960 };

export function Modal({ open, onClose, title, children, size = 'md', footer, noPadding }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: sizeMap[size], maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg2)', border: '1px solid var(--border-l)', borderRadius: 'var(--r)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            fontSize: 14, fontWeight: 600, color: 'var(--t)',
          }}>
            <span>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', ...(noPadding ? {} : { padding: '16px 18px' }) }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
