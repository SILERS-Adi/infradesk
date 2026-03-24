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
    <div className={clsx('bg-white rounded-lg border border-gray-200 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-6')}>{children}</div>
    </div>
  );
}
