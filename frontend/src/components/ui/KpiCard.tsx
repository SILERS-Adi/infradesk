import type { ReactNode } from 'react';

interface KpiCardProps {
  /** Uppercase label above the value */
  label: string;
  /** Main metric value (formatted string) */
  value: string;
  /** Optional subtext below value */
  sub?: string;
  /** Icon component (lucide-react) */
  icon: ReactNode;
  /** CSS color for the icon circle background */
  color: string;
  /** Optional click handler (makes card interactive) */
  onClick?: () => void;
}

export function KpiCard({ label, value, sub, icon, color, onClick }: KpiCardProps) {
  return (
    <div
      className="page-card"
      onClick={onClick}
      style={{
        padding: '20px 22px',
        flex: '1 1 200px',
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--trf)',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--td)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--t)',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
