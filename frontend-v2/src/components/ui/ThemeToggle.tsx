import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, type Theme } from '@/store/theme';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Jasny', icon: Sun },
  { value: 'auto', label: 'Auto', icon: Monitor },
  { value: 'dark', label: 'Ciemny', icon: Moon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  return (
    <div
      className="inline-flex rounded-[var(--r-s)] border border-bd bg-sf2 p-1"
      role="radiogroup"
      aria-label="Tryb kolorystyczny"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            title={o.label}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-[8px] press transition-colors',
              active ? 'text-white shadow-2' : 'text-tx3 hover:text-tx hover:bg-sf-h',
            )}
            style={active ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)' } : undefined}
          >
            <o.icon className="h-[14px] w-[14px]" aria-hidden />
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
