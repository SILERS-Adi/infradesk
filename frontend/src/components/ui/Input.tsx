import { type InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={clsx(
            'block w-full rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 placeholder:text-white/20 focus:outline-none',
            className
          )}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)'}`,
            color: 'rgba(255,255,255,0.85)',
            boxShadow: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = error ? 'rgba(248,113,113,0.5)' : 'rgba(139,92,246,0.4)';
            e.target.style.boxShadow = `0 0 0 3px ${error ? 'rgba(248,113,113,0.08)' : 'rgba(139,92,246,0.08)'}`;
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)';
            e.target.style.boxShadow = 'none';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {error && <p className="text-[11px]" style={{ color: '#F87171' }}>{error}</p>}
        {hint && !error && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
