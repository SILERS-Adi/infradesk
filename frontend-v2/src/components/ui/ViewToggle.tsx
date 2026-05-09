import { useEffect, useState } from 'react';
import { LayoutGrid, Table2, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'visual' | 'table' | 'kanban';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  enableKanban?: boolean; // niektóre listy nie obsługują kanban
}

export function ViewToggle({ value, onChange, enableKanban = false }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-[var(--r-s)] border border-bd bg-sf2 p-1" role="radiogroup" aria-label="Układ widoku">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'visual'}
        onClick={() => onChange('visual')}
        className={cn(
          'flex items-center gap-1.5 rounded-[8px] px-2.5 h-7 text-[11px] font-semibold press transition-colors',
          value === 'visual' ? 'text-white' : 'text-tx3 hover:text-tx',
        )}
        style={value === 'visual' ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)' } : undefined}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Wizualnie
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'table'}
        onClick={() => onChange('table')}
        className={cn(
          'flex items-center gap-1.5 rounded-[8px] px-2.5 h-7 text-[11px] font-semibold press transition-colors',
          value === 'table' ? 'text-white' : 'text-tx3 hover:text-tx',
        )}
        style={value === 'table' ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)' } : undefined}
      >
        <Table2 className="h-3.5 w-3.5" aria-hidden /> Tabelarycznie
      </button>
      {enableKanban && (
        <button
          type="button"
          role="radio"
          aria-checked={value === 'kanban'}
          onClick={() => onChange('kanban')}
          className={cn(
            'flex items-center gap-1.5 rounded-[8px] px-2.5 h-7 text-[11px] font-semibold press transition-colors',
            value === 'kanban' ? 'text-white' : 'text-tx3 hover:text-tx',
          )}
          style={value === 'kanban' ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)' } : undefined}
        >
          <Columns3 className="h-3.5 w-3.5" aria-hidden /> Kanban
        </button>
      )}
    </div>
  );
}

export function useViewPreference(storageKey: string, defaultValue: ViewMode = 'visual'): [ViewMode, (v: ViewMode) => void] {
  const key = `idesk-view:${storageKey}`;
  const [value, setValue] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = window.localStorage.getItem(key);
    return (stored === 'visual' || stored === 'table' || stored === 'kanban') ? stored : defaultValue;
  });
  useEffect(() => { window.localStorage.setItem(key, value); }, [key, value]);
  return [value, setValue];
}
