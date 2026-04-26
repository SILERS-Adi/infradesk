import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx placeholder:text-tx3',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--pri-glow)] focus-visible:border-[var(--bd-f)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-all',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx placeholder:text-tx3',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--pri-glow)] focus-visible:border-[var(--bd-f)]',
        'disabled:opacity-50 resize-y',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--pri-glow)] focus-visible:border-[var(--bd-f)]',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
