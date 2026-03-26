import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Building2, Ticket, Monitor, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../../api/clients';
import { ticketsApi } from '../../api/tickets';
import { devicesApi } from '../../api/devices';
import { useDebounce } from '../../hooks/useDebounce';

export function MobileSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const hasQuery = debouncedQuery.trim().length >= 2;

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['mobile-search-clients', debouncedQuery],
    queryFn: () => clientsApi.getAll({ search: debouncedQuery }),
    enabled: hasQuery,
  });

  const { data: tickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['mobile-search-tickets', debouncedQuery],
    queryFn: () => ticketsApi.getAll({ search: debouncedQuery, limit: 10 }),
    enabled: hasQuery,
  });

  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['mobile-search-devices', debouncedQuery],
    queryFn: () => devicesApi.getAll({ search: debouncedQuery }),
    enabled: hasQuery,
  });

  const isLoading = loadingClients || loadingTickets || loadingDevices;
  const hasResults = clients.length > 0 || tickets.length > 0 || devices.length > 0;

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6B7280' }} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Szukaj firm, zgłoszeń, urządzeń..."
          autoFocus
          className="w-full pl-12 pr-4 py-4 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          style={{ background: 'rgba(20,30,48,0.85)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
        />
        {isLoading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" style={{ color: '#5B5FEF' }} />}
      </div>

      {/* Results */}
      {hasQuery && !isLoading && !hasResults && (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: '#6B7280' }}>Brak wyników dla "{debouncedQuery}"</p>
        </div>
      )}

      {clients.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>Firmy</p>
          <div className="space-y-1.5">
            {clients.slice(0, 5).map(c => (
              <button key={c.id} onClick={() => navigate(`/clients/${c.id}`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left active:scale-[0.98] transition-all"
                style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Building2 className="h-4 w-4 flex-shrink-0" style={{ color: '#5B5FEF' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{c.name}</p>
                  {c.city && <p className="text-xs" style={{ color: '#6B7280' }}>{c.city}</p>}
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: '#4B5563' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {tickets.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>Zgłoszenia</p>
          <div className="space-y-1.5">
            {tickets.slice(0, 5).map(t => (
              <button key={t.id} onClick={() => navigate(`/m/tickets/${t.id}`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left active:scale-[0.98] transition-all"
                style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Ticket className="h-4 w-4 flex-shrink-0" style={{ color: '#00C2FF' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{t.title}</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>{t.ticketNumber} · {t.client?.name}</p>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: '#4B5563' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {devices.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>Urządzenia</p>
          <div className="space-y-1.5">
            {devices.slice(0, 5).map((d: any) => (
              <button key={d.id} onClick={() => navigate(`/devices/${d.id}`)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left active:scale-[0.98] transition-all"
                style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Monitor className="h-4 w-4 flex-shrink-0" style={{ color: '#22C55E' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{d.name}</p>
                  <p className="text-xs" style={{ color: '#6B7280' }}>{d.client?.name}{d.hostname ? ` · ${d.hostname}` : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: '#4B5563' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasQuery && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto mb-3" style={{ color: '#4B5563' }} />
          <p className="text-sm" style={{ color: '#6B7280' }}>Wpisz minimum 2 znaki aby wyszukać</p>
        </div>
      )}
    </div>
  );
}
