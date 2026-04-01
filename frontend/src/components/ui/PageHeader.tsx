import { type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: boolean | string;
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="content-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {back && (
          <button onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: 6, cursor: 'pointer', color: 'var(--tm)' }}>
            <ChevronLeft style={{ width: 18, height: 18 }} />
          </button>
        )}
        <div>
          <div className="content-title">{title}</div>
          {subtitle && <div className="content-subtitle">{subtitle}</div>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{actions}</div>}
    </div>
  );
}
