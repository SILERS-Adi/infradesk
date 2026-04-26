import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  trend?: { value: number; direction: 'up' | 'down' | 'flat' };
  accent?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
  className?: string;
}

const ACCENT_VAR = {
  primary: '--pri',
  success: '--ok',
  danger:  '--er',
  warning: '--wn',
  neutral: '--tx3',
} as const;

export function StatCard({ icon: Icon, label, value, trend, accent = 'primary', className }: StatCardProps) {
  const cssVar = ACCENT_VAR[accent];
  const color = `var(${cssVar})`;
  const bg = `color-mix(in srgb, ${color} 12%, transparent)`;
  return (
    <div className={cn('card p-4 flex items-center gap-4', className)}>
      <div
        className="w-11 h-11 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
        style={{ background: bg }}
      >
        <Icon style={{ width: 20, height: 20, color }} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-tx3 mb-0.5">{label}</p>
        <p className="text-[22px] font-black text-tx tabular-nums leading-tight">{value}</p>
        {trend && (
          <p className="text-[10px] font-medium mt-1" style={{ color: trend.direction === 'up' ? 'var(--ok)' : trend.direction === 'down' ? 'var(--er)' : 'var(--tx3)' }}>
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {Math.abs(trend.value)} vs poprzedni
          </p>
        )}
      </div>
    </div>
  );
}
