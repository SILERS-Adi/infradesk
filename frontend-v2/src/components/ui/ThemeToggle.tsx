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
    <div className="inline-flex rounded-[var(--rs)] border border-border bg-bg2 p-1" role="radiogroup" aria-label="Tryb kolorystyczny">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => setTheme(o.value)}
          title={o.label}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
            theme === o.value ? 'bg-accent text-accent-fg' : 'text-tm hover:text-t',
          )}
        >
          <o.icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
