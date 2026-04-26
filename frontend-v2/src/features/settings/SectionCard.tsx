import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

/**
 * Shared section shell used by all settings sections.
 * Keeps title / description / body spacing consistent.
 */
export function SectionCard({
  title,
  description,
  danger,
  children,
  footer,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card
      className="p-[var(--sp-5)]"
      style={danger ? { borderColor: 'var(--er-b)' } : undefined}
    >
      <div className="mb-[var(--sp-4)]">
        <h2
          className="text-[18px] font-semibold leading-tight"
          style={{ color: danger ? 'var(--er)' : undefined }}
        >
          {title}
        </h2>
        {description && (
          <p className="text-[12px] text-[var(--tx3)] mt-1">{description}</p>
        )}
      </div>
      <div>{children}</div>
      {footer && (
        <div className="mt-[var(--sp-4)] pt-[var(--sp-4)] border-t border-[var(--bd)] flex items-center gap-2">
          {footer}
        </div>
      )}
    </Card>
  );
}

export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--tx3)] mt-1">{hint}</p>}
    </div>
  );
}
