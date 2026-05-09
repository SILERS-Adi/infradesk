import { Bell, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../ui/ThemeToggle';
import { IrisCore } from '../iris/IrisCore';
import { api } from '@/lib/api';

interface NotifSummary { unread?: number }

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const navigate = useNavigate();
  // Best-effort: pokażemy kropkę gdy są nieprzeczytane. Endpoint może nie istnieć
  // we wszystkich środowiskach — nie pokazuj fałszywego alarmu, gdy 404/oczekiwanie.
  const { data } = useQuery<NotifSummary>({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications/unread')).data,
    staleTime: 30_000,
    retry: false,
  });
  const unread = data?.unread ?? 0;

  return (
    <header
      className="h-[52px] flex items-center justify-between px-3 sm:px-5 sticky top-0 z-30 glass"
      style={{ borderBottom: '1px solid var(--bd)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-[var(--r-s)] text-tx2 press hover:bg-sf-h"
          aria-label="Menu"
        >
          <Menu style={{ width: 18, height: 18 }} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <IrisCore
          size="sm"
          state="idle"
          onClick={() => navigate('/ai')}
          ariaLabel="Otwórz Iris"
        />
        <ThemeToggle />
        <button
          type="button"
          className="relative p-2 rounded-[var(--r-s)] text-tx2 press hover:bg-sf-h transition-colors"
          aria-label={unread > 0 ? `Powiadomienia (${unread} nieprzeczytane)` : 'Powiadomienia'}
        >
          <Bell style={{ width: 15, height: 15, strokeWidth: 1.7 }} />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ background: 'var(--er)' }}
            />
          )}
        </button>
      </div>
    </header>
  );
}
