import { useEffect, useState } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'visual' | 'table';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

/**
 * Toggle between two layouts for the same data:
 *   - visual: cards / charts / graph / map (preferred for OWNER/ADMIN)
 *   - table: spreadsheet-like (preferred for technicians)
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-[var(--rs)] border border-border bg-bg2 p-1" role="radiogroup" aria-label="Układ widoku">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'visual'}
        onClick={() => onChange('visual')}
        className={cn(
          'flex items-center gap-1.5 rounded-sm px-2.5 h-7 text-xs font-medium transition-colors',
          value === 'visual' ? 'bg-accent text-accent-fg' : 'text-tm hover:text-t',
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Wizualnie
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'table'}
        onClick={() => onChange('table')}
        className={cn(
          'flex items-center gap-1.5 rounded-sm px-2.5 h-7 text-xs font-medium transition-colors',
          value === 'table' ? 'bg-accent text-accent-fg' : 'text-tm hover:text-t',
        )}
      >
        <Table2 className="h-3.5 w-3.5" aria-hidden /> Tabelarycznie
      </button>
    </div>
  );
}

/**
 * Persisted-per-user preference for a given view key.
 * Technicians (pure client-side heuristic) default to 'table'.
 */
export function useViewPreference(storageKey: string, defaultValue: ViewMode = 'visual'): [ViewMode, (v: ViewMode) => void] {
  const key = `idesk-view:${storageKey}`;
  const [value, setValue] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = window.localStorage.getItem(key);
    return (stored === 'visual' || stored === 'table') ? stored : defaultValue;
  });
  useEffect(() => { window.localStorage.setItem(key, value); }, [key, value]);
  return [value, setValue];
}
