import type { ReactNode } from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  /** Visual type determining icon and color */
  type?: AlertType;
  /** Optional bold title */
  title?: string;
  /** Alert content */
  children: ReactNode;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Called when dismissed */
  onDismiss?: () => void;
}

const config: Record<AlertType, { icon: typeof Info; color: string; bg: string; border: string }> = {
  info: {
    icon: Info,
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.25)',
  },
  success: {
    icon: CheckCircle2,
    color: '#4ADE80',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
  },
  warning: {
    icon: AlertTriangle,
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.25)',
  },
  error: {
    icon: XCircle,
    color: '#F87171',
    bg: 'rgba(248,113,113,0.08)',
    border: 'rgba(248,113,113,0.25)',
  },
};

export function Alert({
  type = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
}: AlertProps) {
  const c = config[type];
  const Icon = c.icon;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 'var(--rs)',
        background: c.bg,
        borderLeft: `3px solid ${c.border}`,
      }}
    >
      <Icon
        size={18}
        style={{ color: c.color, flexShrink: 0, marginTop: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--t)',
              marginBottom: 2,
            }}
          >
            {title}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--ts)', lineHeight: 1.5 }}>
          {children}
        </div>
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          type="button"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--tm)',
            padding: 2,
            flexShrink: 0,
            display: 'flex',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
