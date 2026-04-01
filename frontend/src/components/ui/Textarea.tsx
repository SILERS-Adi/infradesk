import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label htmlFor={inputId} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)' }}>
            {label}
          </label>
        )}
        <textarea
          id={inputId} ref={ref} rows={3}
          className={clsx(className)}
          style={{
            width: '100%', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, resize: 'vertical',
            background: 'var(--hover-bg)',
            border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
            color: 'var(--t)', outline: 'none', transition: 'var(--trf)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--accent)';
            e.target.style.boxShadow = '0 0 0 3px var(--accent-g)';
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
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
