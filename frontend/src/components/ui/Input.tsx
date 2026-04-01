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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={inputId} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)' }}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={clsx(className)}
          style={{
            width: '100%', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13,
            background: 'var(--hover-bg)',
            border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
            color: 'var(--t)', outline: 'none', transition: 'var(--trf)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = error ? 'rgba(248,113,113,0.5)' : 'var(--accent)';
            e.target.style.boxShadow = `0 0 0 3px ${error ? 'rgba(248,113,113,0.08)' : 'var(--accent-g)'}`;
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'rgba(248,113,113,0.4)' : 'var(--border)';
            e.target.style.boxShadow = 'none';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {error && <p style={{ fontSize: 11, color: '#F87171' }}>{error}</p>}
        {hint && !error && <p style={{ fontSize: 11, color: 'var(--td)' }}>{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
