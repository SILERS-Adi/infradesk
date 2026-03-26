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
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          rows={3}
          className={clsx('block w-full rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 placeholder:text-white/20 focus:outline-none resize-y', className)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)'}`,
            color: 'rgba(255,255,255,0.85)',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(139,92,246,0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)'; props.onFocus?.(e); }}
          onBlur={(e) => { e.target.style.borderColor = error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)'; e.target.style.boxShadow = 'none'; props.onBlur?.(e); }}
          {...props}
        />
        {error && <p className="text-[11px]" style={{ color: '#F87171' }}>{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
