import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  title = 'Brak danych',
  description = 'Nie znaleziono żadnych rekordów.',
  action, icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-4"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        {icon ?? <Inbox className="h-6 w-6" style={{ color: 'rgba(255,255,255,0.2)' }} />}
      </div>
      <h3 className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{title}</h3>
      <p className="mt-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
