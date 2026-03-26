import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  children,
  className,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none active:scale-[0.97]',
        {
          'text-white': variant === 'primary',
          'text-white/60 hover:text-white/80 border border-white/8 hover:border-white/12 bg-white/[0.04] hover:bg-white/[0.06]': variant === 'secondary',
          'text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20': variant === 'danger',
          'text-white/50 hover:bg-white/[0.04] hover:text-white/70': variant === 'ghost',
          'border border-violet-500/30 text-violet-400 hover:bg-violet-500/10': variant === 'outline',
          'px-3 py-1.5 text-xs': size === 'sm',
          'px-4 py-2.5 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
          'opacity-40 cursor-not-allowed': disabled || loading,
        },
        className
      )}
      style={{
        ...(variant === 'primary' ? {
          background: 'linear-gradient(145deg, #6D28D9, #2563EB)',
          boxShadow: '0 1px 8px rgba(109,40,217,0.15)',
        } : {}),
        ...style,
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  );
}
