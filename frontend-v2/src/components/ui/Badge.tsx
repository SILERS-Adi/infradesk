import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeStyles = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', {
  variants: {
    variant: {
      neutral: 'bg-sf-h text-tx2 border border-bd',
      accent:  'text-[color:var(--pri)]',
      success: 'text-[color:var(--ok)]',
      danger:  'text-[color:var(--er)]',
      warning: 'text-[color:var(--wn)]',
      info:    'text-[color:var(--in)]',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

const bgMap: Record<string, React.CSSProperties> = {
  accent: { background: 'var(--pri-l)', borderColor: 'var(--bd-f)', borderWidth: 1 } as React.CSSProperties,
  success: { background: 'var(--ok-l)', border: '1px solid var(--ok-b)' } as React.CSSProperties,
  danger:  { background: 'var(--er-l)', border: '1px solid var(--er-b)' } as React.CSSProperties,
  warning: { background: 'var(--wn-l)', border: '1px solid var(--wn-b)' } as React.CSSProperties,
  info:    { background: 'var(--in-l)', border: '1px solid var(--in-b)' } as React.CSSProperties,
};

export function Badge({ className, variant = 'neutral', style, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return (
    <span
      className={cn(badgeStyles({ variant }), className)}
      style={{ ...(variant && bgMap[variant]), ...style }}
      {...props}
    />
  );
}
