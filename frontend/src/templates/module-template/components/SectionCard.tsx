/**
 * IDS 1.0 — SectionCard
 *
 * A Card with an icon + uppercase label header, used for grouping
 * related info in detail pages (e.g. "SPRZEDAWCA", "DATY I PŁATNOŚĆ").
 *
 * This IS a reusable component — import it directly.
 */

import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/Card';

interface SectionCardProps {
  /** Lucide icon component */
  icon: React.ElementType;
  /** Uppercase section label */
  label: string;
  /** Card content */
  children: ReactNode;
}

export function SectionCard({ icon: Icon, label, children }: SectionCardProps) {
  return (
    <Card noPadding>
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon size={14} style={{ color: 'var(--accent)' }} />
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--td)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {label}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6 }}>
          {children}
        </div>
      </div>
    </Card>
  );
}
