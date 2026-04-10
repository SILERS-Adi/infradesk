import { useState, useEffect } from 'react';
import { FileText, Wand2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   FormModeToggle — przełącznik trybu dodawania:
   • "form"   → prosty formularz kartowy (wszystko na jednej stronie)
   • "wizard" → kreator krok po kroku z progress barem i animacjami
   ═══════════════════════════════════════════════════════════════════ */

export type FormMode = 'form' | 'wizard';

interface FormModeToggleProps {
  mode: FormMode;
  onChange: (mode: FormMode) => void;
}

const STORAGE_KEY = 'infradesk_form_mode';

export function useFormMode(): [FormMode, (m: FormMode) => void] {
  const [mode, setMode] = useState<FormMode>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'form' ? 'form' : 'wizard';
    } catch { return 'wizard'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }, [mode]);

  return [mode, setMode];
}

export function FormModeToggle({ mode, onChange }: FormModeToggleProps) {
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        borderRadius: 12, padding: 3,
        background: 'var(--hover-bg)',
        border: '1px solid var(--border)',
      }}
    >
      <ToggleButton
        active={mode === 'form'}
        onClick={() => onChange('form')}
        icon={<FileText size={13} />}
        label="Formularz"
      />
      <ToggleButton
        active={mode === 'wizard'}
        onClick={() => onChange('wizard')}
        icon={<Wand2 size={13} />}
        label="Kreator"
      />
    </div>
  );
}

function ToggleButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 9,
        fontSize: 12, fontWeight: active ? 700 : 500,
        color: active ? '#fff' : 'var(--tm)',
        background: active
          ? 'linear-gradient(135deg, #5B5FEF, #8B5CF6)'
          : 'transparent',
        border: 'none', cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: active ? '0 2px 8px rgba(91,95,239,0.3)' : 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
