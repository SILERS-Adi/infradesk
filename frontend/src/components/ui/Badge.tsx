import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: ReactNode;
  color?: 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'indigo' | 'purple' | 'pink';
  className?: string;
}

const colorMap: Record<NonNullable<BadgeProps['color']>, { bg: string; text: string }> = {
  gray:   { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' },
  blue:   { bg: 'rgba(96,165,250,0.12)',  text: '#60A5FA' },
  green:  { bg: 'rgba(34,197,94,0.12)',   text: '#4ADE80' },
  yellow: { bg: 'rgba(251,191,36,0.12)',  text: '#FBBF24' },
  orange: { bg: 'rgba(251,146,60,0.12)',  text: '#FB923C' },
  red:    { bg: 'rgba(248,113,113,0.12)', text: '#F87171' },
  indigo: { bg: 'rgba(129,140,248,0.12)', text: '#818CF8' },
  purple: { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA' },
  pink:   { bg: 'rgba(244,114,182,0.12)', text: '#F472B6' },
};

export function Badge({ children, color = 'gray', className }: BadgeProps) {
  const c = colorMap[color];
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold', className)}
      style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  );
}
