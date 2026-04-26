import { cn } from '@/lib/utils';

const MAP: Record<string, { label: string; color: string }> = {
  LOW:      { label: 'Niski',     color: 'var(--tx3)' },
  MEDIUM:   { label: 'Średni',    color: 'var(--pri)' },
  HIGH:     { label: 'Wysoki',    color: 'var(--wn)' },
  CRITICAL: { label: 'Krytyczny', color: 'var(--er)' },
};

export function PriorityDot({ priority, withLabel = false, className }: { priority: string; withLabel?: boolean; className?: string }) {
  const cfg = MAP[priority] ?? MAP.MEDIUM!;
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={cfg.label}>
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
        aria-label={`Priorytet ${cfg.label}`}
      />
      {withLabel && <span className="text-[11px] font-medium text-tx2">{cfg.label}</span>}
    </span>
  );
}
