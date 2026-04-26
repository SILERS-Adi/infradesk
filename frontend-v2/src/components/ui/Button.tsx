import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--r-s)] font-medium transition-all press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'text-white shadow-2 glow',
        secondary: 'bg-sf-h text-tx2 hover:bg-sf hover:text-tx border border-bd',
        ghost: 'text-tx2 hover:bg-sf-h hover:text-tx',
        outline: 'border border-bd text-tx hover:bg-sf-h',
        danger: 'bg-er text-white hover:brightness-110',
        success: 'bg-ok text-white hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        md: 'h-10 px-4 text-[13px]',
        lg: 'h-12 px-6 text-[14px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  /** Optional leading icon (v1-compat). Prefer rendering as children directly in new code. */
  icon?: ReactNode;
  /** Show spinner + disable button (v1-compat). */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', style, icon, loading, disabled, children, ...props }, ref) => {
  const gradient = variant === 'primary' || variant === undefined
    ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)', boxShadow: '0 4px 16px var(--pri-glow2)' }
    : undefined;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonStyles({ variant, size }), className)}
      style={{ ...gradient, ...style }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
Button.displayName = 'Button';
