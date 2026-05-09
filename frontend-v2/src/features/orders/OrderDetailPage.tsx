import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, AlertCircle, Trash2, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDatePl } from '@/lib/utils';

interface OrderItem {
  id: string;
  partNumber: string | null;
  description: string;
  quantity: number;
  unitNet: string;
  totalNet: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  title: string;
  description: string | null;
  status: string;
  totalNet: string;
  totalGross: string;
  vatRate: string;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  expectedDeliveryDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedTicketId: string | null;
  linkedTicket: { id: string; ticketNumber: string; title: string } | null;
  items: OrderItem[];
}

const ORDER_STATUS_LABEL: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Szkic', variant: 'neutral' },
  QUOTE_SENT: { label: 'Wycena wysłana', variant: 'accent' },
  APPROVED: { label: 'Zatwierdzone', variant: 'accent' },
  ORDERED: { label: 'Zamówione', variant: 'warning' },
  IN_TRANSIT: { label: 'W drodze', variant: 'warning' },
  DELIVERED: { label: 'Dostarczone', variant: 'success' },
  INVOICED: { label: 'Zafakturowane', variant: 'success' },
  CANCELLED: { label: 'Anulowane', variant: 'danger' },
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ order: OrderDetail }>({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data,
    enabled: !!id,
  });

  const deleteOrder = useMutation({
    mutationFn: async () => (await api.delete(`/orders/${id}`)).data,
    onSuccess: () => {
      toast.success('Zamówienie usunięte');
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate('/orders');
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Błąd usuwania'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--pri)' }} />
    </div>
  );
  if (error || !data) return (
    <div className="card p-10 text-center">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-er" />
      <p className="text-tx font-medium mb-2">Nie znaleziono zamówienia</p>
      <Button variant="ghost" onClick={() => navigate('/orders')}>
        <ArrowLeft className="h-4 w-4" /> Wróć do listy
      </Button>
    </div>
  );

  const o = data.order;
  const statusBadge = ORDER_STATUS_LABEL[o.status] ?? ORDER_STATUS_LABEL.DRAFT!;
  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link to="/orders" className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-tx3" />
              <span className="text-[11px] font-mono text-tx3">{o.orderNumber}</span>
            </div>
            <h1 className="text-[20px] font-bold text-tx leading-tight">{o.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
              {o.linkedTicket && (
                <Link to={`/tickets/${o.linkedTicket.id}`} className="text-[12px] hover:underline" style={{ color: 'var(--pri)' }}>
                  ↪ Z zgłoszenia: {o.linkedTicket.ticketNumber}
                </Link>
              )}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Usunąć zamówienie ${o.orderNumber}?`,
              message: 'Akcja nieodwracalna.',
              confirmLabel: 'Usuń',
              danger: true,
            });
            if (ok) deleteOrder.mutate();
          }}
          disabled={deleteOrder.isPending}
          className="text-er border-er/30 hover:bg-er/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {o.description && (
            <Card>
              <CardHeader><CardTitle>Opis</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[13px] text-tx leading-relaxed whitespace-pre-wrap">{o.description}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Pozycje ({o.items.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-[13px]">
                <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
                  <tr>
                    <th className="px-4 py-2.5">Opis</th>
                    <th className="px-4 py-2.5 text-right">Ilość</th>
                    <th className="px-4 py-2.5 text-right">Cena netto</th>
                    <th className="px-4 py-2.5 text-right">Suma netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bd">
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-3">
                        <div className="text-tx">{it.description}</div>
                        {it.partNumber && <div className="text-[11px] text-tx3 font-mono">{it.partNumber}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-tx2">{it.quantity}</td>
                      <td className="px-4 py-3 text-right text-tx2 font-mono">{it.unitNet} zł</td>
                      <td className="px-4 py-3 text-right text-tx font-mono font-semibold">{it.totalNet} zł</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-sf-h border-t border-bd">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-tx3">Suma netto</td>
                    <td className="px-4 py-2.5 text-right text-tx font-mono font-bold">{o.totalNet} zł</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-tx3">Suma brutto (VAT {o.vatRate}%)</td>
                    <td className="px-4 py-2.5 text-right text-tx font-mono font-bold">{o.totalGross} zł</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {(o.supplierName || o.supplierEmail || o.supplierPhone) && (
            <Card>
              <CardHeader><CardTitle>Dostawca</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-[13px]">
                {o.supplierName && <p className="text-tx font-medium">{o.supplierName}</p>}
                {o.supplierEmail && <p><a href={`mailto:${o.supplierEmail}`} className="text-pri hover:underline">{o.supplierEmail}</a></p>}
                {o.supplierPhone && <p><a href={`tel:${o.supplierPhone}`} className="text-pri hover:underline">{o.supplierPhone}</a></p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Daty</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-tx3">Utworzone</span>
                <span className="text-tx">{formatDatePl(o.createdAt)}</span>
              </div>
              {o.expectedDeliveryDate && (
                <div className="flex justify-between">
                  <span className="text-tx3">Oczekiwana dostawa</span>
                  <span className="text-tx">{formatDatePl(o.expectedDeliveryDate)}</span>
                </div>
              )}
              {o.deliveredAt && (
                <div className="flex justify-between">
                  <span className="text-tx3">Dostarczone</span>
                  <span className="text-tx">{formatDatePl(o.deliveredAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default OrderDetailPage;
