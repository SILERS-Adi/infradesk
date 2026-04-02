import { useState, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Current search value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Placeholder text (default: "Szukaj...") */
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Szukaj...',
  style,
  ...rest
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: 'relative', flex: '1 1 0', maxWidth: 320, ...style }}>
      <Search
        size={15}
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: focused ? 'var(--accent)' : 'var(--td)',
          transition: 'var(--trf)',
          pointerEvents: 'none',
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '9px 32px 9px 36px',
          borderRadius: 'var(--rs)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--hover-bg)',
          color: 'var(--t)',
          fontSize: 13,
          outline: 'none',
          transition: 'var(--trf)',
          boxShadow: focused ? '0 0 0 3px var(--accent-g)' : 'none',
        }}
        {...rest}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--tm)',
            padding: 2,
            display: 'flex',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; }}
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
