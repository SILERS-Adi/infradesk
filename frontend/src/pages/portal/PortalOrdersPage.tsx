import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders';
import { ShoppingCart, Package, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import type { Order, OrderStatus } from '../../types';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  ...extra,
});

const STATUS_MAP: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  NEW: { label: 'Nowe', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  PENDING_APPROVAL: { label: 'Oczekuje', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  IN_PROGRESS: { label: 'W realizacji', color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  INSTALLED: { label: 'Zrealizowane', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  CANCELLED: { label: 'Anulowane', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

export function PortalOrdersPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders-portal'],
    queryFn: () => ordersApi.getAll(),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>ORDERS</p>
        <h1 className="text-[22px] font-semibold text-white/90">Zamówienia</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{orders.length} zamówień</p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-[18px] p-12 text-center" style={glass()}>
          <ShoppingCart className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak zamówień</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: Order) => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.NEW;
            const totalValue = order.items?.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0) ?? 0;

            return (
              <div key={order.id} className="rounded-[18px] p-5 transition-all duration-200 hover:scale-[1.005]"
                style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
                {/* Order header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: statusInfo.bg }}>
                      <Package className="h-5 w-5" style={{ color: statusInfo.color }} />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-white/90">{order.orderNumber}</div>
                      <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {formatDate(order.createdAt)}
                        {order.ticket && <> · Zgł. {order.ticket.ticketNumber}</>}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ background: statusInfo.bg, color: statusInfo.color }}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-1.5 px-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[12px] text-white/70 truncate">{item.name}</span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>x{item.quantity}</span>
                        </div>
                        {item.price != null && (
                          <span className="text-[12px] font-medium text-white/50 flex-shrink-0 ml-3">
                            {(item.price * item.quantity).toFixed(2)} zł
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {order.notes && (
                    <span className="text-[11px] truncate mr-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{order.notes}</span>
                  )}
                  {totalValue > 0 && (
                    <span className="text-[13px] font-semibold text-white/70 ml-auto">{totalValue.toFixed(2)} zł</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
