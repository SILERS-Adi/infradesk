import { type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HelpPanel } from './HelpPanel';
import { helpContent } from '../../config/helpContent';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: boolean | string;
  /** Klucz z helpContent — wyświetla przycisk „Pomoc" i rozwijany panel instrukcji */
  helpKey?: string;
}

export function PageHeader({ title, subtitle, actions, back, helpKey }: PageHeaderProps) {
  const navigate = useNavigate();
  const help = helpKey ? helpContent[helpKey] : undefined;

  return (
    <div className="content-header">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {help && <HelpPanel {...help} />}
          {actions}
        </div>
      </div>
    </div>
  );
}
