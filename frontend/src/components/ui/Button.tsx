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

/**
 * Uses exact .btn-primary / .btn-secondary classes from agent/ui/styles.css
 */
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
  const sizeStyle = size === 'sm'
    ? { padding: '6px 14px', fontSize: 11 }
    : size === 'lg'
    ? { padding: '12px 28px', fontSize: 13 }
    : {};

  return (
    <button
      className={clsx(
        {
          'btn-primary': variant === 'primary',
          'btn-secondary': variant === 'secondary' || variant === 'ghost' || variant === 'outline',
        },
        className
      )}
      style={{
        ...sizeStyle,
        ...(variant === 'danger' ? {
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#F87171',
        } : {}),
        ...(disabled || loading ? { opacity: 0.4, pointerEvents: 'none' as const } : {}),
        ...style,
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="spinning" style={{ width: 14, height: 14 }} /> : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  );
}
