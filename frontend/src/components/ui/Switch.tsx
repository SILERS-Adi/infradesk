interface SwitchProps {
  /** Whether the switch is on */
  checked: boolean;
  /** Called when toggled */
  onChange: (checked: boolean) => void;
  /** Optional label shown to the right */
  label?: string;
  /** Optional description below the label */
  description?: string;
  /** Disable interaction */
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          position: 'relative',
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 'none',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? 'var(--accent)' : 'var(--border-l)',
          transition: 'var(--trf)',
          flexShrink: 0,
          marginTop: label ? 1 : 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: checked ? '#fff' : 'var(--tm)',
            transition: 'var(--trf)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </button>
      {(label || description) && (
        <div style={{ minWidth: 0 }}>
          {label && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--t)',
                lineHeight: 1.4,
              }}
            >
              {label}
            </div>
          )}
          {description && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--tm)',
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
