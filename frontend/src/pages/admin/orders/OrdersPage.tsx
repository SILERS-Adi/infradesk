import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersApi } from '../../../api/orders';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import type { Order, OrderStatus } from '../../../types';
import { ExternalLink, Package } from 'lucide-react';

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Nowe',
  PENDING_APPROVAL: 'Oczekuje na akceptację',
  IN_PROGRESS: 'W realizacji',
  INSTALLED: 'Zamontowane',
  CANCELLED: 'Anulowane',
};
const STATUS_COLORS: Record<OrderStatus, { bg: string; color: string }> = {
  NEW:              { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  PENDING_APPROVAL: { bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  IN_PROGRESS:      { bg: 'rgba(249,115,22,0.12)',  color: '#FB923C' },
  INSTALLED:        { bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  CANCELLED:        { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' },
};
const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: 'PENDING_APPROVAL',
  PENDING_APPROVAL: 'IN_PROGRESS',
  IN_PROGRESS: 'INSTALLED',
};

export function OrdersPage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders-all', filterStatus],
    queryFn: () => ordersApi.getAll(filterStatus ? { status: filterStatus } : undefined),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => ordersApi.changeStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders-all'] }); toast.success('Status zaktualizowany'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const activeStatuses: OrderStatus[] = ['NEW', 'PENDING_APPROVAL', 'IN_PROGRESS', 'INSTALLED', 'CANCELLED'];

  return (
    <div>
      <PageHeader title="Zamówienia" subtitle={`${orders.length} pozycji`} />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 rounded-lg p-1 w-fit" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!filterStatus ? 'bg-violet-600 text-white' : 'hover:bg-white/[0.03]'}`}
          style={filterStatus ? { color: 'rgba(255,255,255,0.5)' } : undefined}
        >
          Wszystkie
        </button>
        {activeStatuses.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatus === s ? 'bg-violet-600 text-white' : 'hover:bg-white/[0.03]'}`}
            style={filterStatus !== s ? { color: 'rgba(255,255,255,0.5)' } : undefined}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}><Package className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Brak zamówień</p></div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Order) => (
            <div key={order.id} className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm font-bold text-violet-400">{order.orderNumber}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color }}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{order.client?.name}</span>
                  </div>
                  <div className="space-y-1">
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-white/80">{item.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>×{item.quantity}</span>
                        {item.price && <span style={{ color: 'rgba(255,255,255,0.4)' }}>{item.price.toFixed(2)} zł</span>}
                        {item.addToInventory && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.12)', color: '#A78BFA' }}>📦 Inwentarz</span>}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {order.notes && <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{order.notes}</p>}
                  <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(order.createdAt)} · {order.createdBy?.firstName} {order.createdBy?.lastName}</p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {STATUS_NEXT[order.status] && (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: STATUS_NEXT[order.status]! })}
                      disabled={statusMutation.isPending}
                      className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 font-medium whitespace-nowrap"
                    >
                      → {STATUS_LABELS[STATUS_NEXT[order.status]!]}
                    </button>
                  )}
                  {order.status !== 'CANCELLED' && order.status !== 'INSTALLED' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                      disabled={statusMutation.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10 font-medium transition-colors"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      Anuluj
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
