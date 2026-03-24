import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersApi } from '../../../api/orders';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
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
const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-orange-100 text-orange-700',
  INSTALLED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
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
      <div className="flex gap-1 mb-6 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!filterStatus ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Wszystkie
        </button>
        {activeStatuses.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><Package className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Brak zamówień</p></div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Order) => (
            <Card key={order.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm font-bold text-indigo-600">{order.orderNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-xs text-gray-400">{order.client?.name}</span>
                  </div>
                  <div className="space-y-1">
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-gray-800">{item.name}</span>
                        <span className="text-gray-400">×{item.quantity}</span>
                        {item.price && <span className="text-gray-500">{item.price.toFixed(2)} zł</span>}
                        {item.addToInventory && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">📦 Inwentarz</span>}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {order.notes && <p className="text-xs text-gray-500 mt-2">{order.notes}</p>}
                  <p className="text-xs text-gray-400 mt-2">{formatDate(order.createdAt)} · {order.createdBy?.firstName} {order.createdBy?.lastName}</p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {STATUS_NEXT[order.status] && (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: STATUS_NEXT[order.status]! })}
                      disabled={statusMutation.isPending}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium whitespace-nowrap"
                    >
                      → {STATUS_LABELS[STATUS_NEXT[order.status]!]}
                    </button>
                  )}
                  {order.status !== 'CANCELLED' && order.status !== 'INSTALLED' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                      disabled={statusMutation.isPending}
                      className="text-xs text-gray-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                    >
                      Anuluj
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
