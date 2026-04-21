import { Bell, Search } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';

export function Topbar() {
  return (
    <header
      className="h-[52px] flex items-center justify-between px-5 sticky top-0 z-30 glass"
      style={{ borderBottom: '1px solid var(--bd)' }}
    >
      <div className="relative w-64">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3"
          style={{ width: 14, height: 14 }}
          aria-hidden
        />
        <input
          placeholder="Szukaj… (Ctrl+K)"
          aria-label="Szukaj"
          className="w-full pl-9 pr-3 py-[6px] text-[12px] rounded-[var(--r-s)] bg-sf2 border border-bd text-tx placeholder:text-tx3 focus:outline-none focus:ring-[3px] focus:ring-[var(--pri-glow)] focus:border-[var(--bd-f)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          className="relative p-2 rounded-[var(--r-s)] text-tx2 press hover:bg-sf-h transition-colors"
          aria-label="Powiadomienia"
        >
          <Bell style={{ width: 15, height: 15, strokeWidth: 1.7 }} />
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ background: 'var(--er)' }}
          />
        </button>
      </div>
    </header>
  );
}
