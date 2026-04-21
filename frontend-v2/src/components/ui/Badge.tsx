import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeStyles = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-bg2 text-ts border border-border',
      accent: 'bg-accent/15 text-accent border border-accent/30',
      success: 'bg-success/15 text-success border border-success/30',
      danger: 'bg-danger/15 text-danger border border-danger/30',
      warning: 'bg-warning/15 text-warning border border-warning/30',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ variant }), className)} {...props} />;
}
