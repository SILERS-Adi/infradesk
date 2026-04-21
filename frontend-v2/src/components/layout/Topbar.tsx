import { Bell, Search } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Input } from '../ui/Input';

export function Topbar() {
  return (
    <header className="h-16 shrink-0 border-b border-bd bg-sf2/30 backdrop-blur flex items-center px-6 gap-4">
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx3" aria-hidden />
        <Input className="pl-9" placeholder="Szukaj — Ctrl+K" aria-label="Szukaj" />
      </div>
      <ThemeToggle />
      <button type="button" className="relative h-9 w-9 rounded-full bg-sf2 flex items-center justify-center text-tx3 hover:text-tx transition-colors" aria-label="Powiadomienia">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-er" />
      </button>
    </header>
  );
}
