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

const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' };

export function Modal({ open, onClose, title, children, size = 'md', footer, noPadding }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose}
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div className={clsx('relative w-full flex flex-col max-h-[90vh] rounded-[18px] overflow-hidden', sizeMap[size])}
        style={{ background: 'rgba(14,20,38,0.97)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <h2 className="text-[15px] font-semibold text-white/85">{title}</h2>
            <button onClick={onClose} className="text-white/25 hover:text-white/50 p-1 rounded-lg hover:bg-white/[0.04] transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={clsx('flex-1 min-h-0', noPadding ? 'flex flex-col' : 'overflow-y-auto p-5')}>{children}</div>
        {footer && (
          <div className="px-5 py-4 flex justify-end gap-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
