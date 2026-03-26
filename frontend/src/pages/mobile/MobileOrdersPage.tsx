import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, ChevronRight, Loader2, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  NEW:         { label: 'Nowe', bg: 'rgba(91,95,239,0.2)', color: '#818CF8' },
  ORDERED:     { label: 'Zamówione', bg: 'rgba(0,194,255,0.2)', color: '#00C2FF' },
  DELIVERED:   { label: 'Dostarczone', bg: 'rgba(34,197,94,0.2)', color: '#22C55E' },
  CANCELLED:   { label: 'Anulowane', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  IN_PROGRESS: { label: 'W realizacji', bg: 'rgba(245,158,11,0.2)', color: '#F59E0B' },
};

export function MobileOrdersPage() {
  const navigate = useNavigate();

  // Import dynamically to avoid issues if orders API doesn't exist yet
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['mobile-orders'],
    queryFn: async () => {
      const { default: api } = await import('../../api/client');
      const { data } = await api.get('/orders', { params: { limit: 50 } });
      return (data as any).data ?? data ?? [];
    },
  });

  return (
    <div className="px-5 py-4 space-y-4">
      <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>Zamówienia</h1>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5B5FEF' }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-12 w-12 mx-auto mb-3" style={{ color: '#4B5563' }} />
          <p className="text-sm" style={{ color: '#6B7280' }}>Brak zamówień</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(orders as any[]).map((o: any) => {
            const st = STATUS_MAP[o.status] ?? { label: o.status, bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' };
            return (
              <button key={o.id} onClick={() => navigate(`/orders`)}
                className="w-full flex items-center gap-3 p-4 rounded-[18px] text-left active:scale-[0.98] transition-all duration-200"
                style={{ background: 'rgba(20,30,48,0.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(91,95,239,0.1)' }}>
                  <ShoppingCart className="h-5 w-5" style={{ color: '#818CF8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-mono" style={{ color: '#6B7280' }}>{o.orderNumber ?? ''}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: '#E5E7EB' }}>{o.title ?? o.description ?? 'Zamówienie'}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#6B7280' }}>{o.client?.name ?? ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#4B5563' }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
