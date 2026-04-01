import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  noPadding?: boolean;
}

/**
 * Uses exact .page-card class from agent/ui/styles.css
 */
export function Card({ children, className, title, action, noPadding }: CardProps) {
  return (
    <div className={clsx('page-card', className)}>
      {(title || action) && (
        <div className="page-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {title && <span>{title}</span>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'page-card-body')}>{children}</div>
    </div>
  );
}
