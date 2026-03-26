import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  noPadding?: boolean;
}

export function Card({ children, className, title, action, noPadding }: CardProps) {
  return (
    <div className={clsx('rounded-[16px]', className)}
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.2), 0 0 0 0.5px rgba(255,255,255,0.03) inset' }}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {title && <h3 className="text-[13px] font-semibold text-white/70">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-5')}>{children}</div>
    </div>
  );
}
