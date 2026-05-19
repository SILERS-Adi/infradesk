import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, AlertCircle, Trash2, Package, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDatePl } from '@/lib/utils';

// Pełen workflow: DRAFT → QUOTE_SENT → APPROVED → ORDERED → IN_TRANSIT → DELIVERED → INVOICED
// CANCELLED dostępny z większości stanów. Po DELIVERED można jeszcze oznaczyć INVOICED.
// Bez tej tabeli UI nie miał żadnych przycisków zmiany statusu — order zostawał DRAFT na zawsze
// (P0 bug znaleziony 2026-05-19 podczas audytu komponentów ticketu).
const STATUS_NEXT: Record<string, Array<{ status: string; label: string; hint: string; variant: 'primary' | 'outline' | 'danger' }>> = {
  DRAFT:      [
    { status: 'QUOTE_SENT', label: 'Wyślij wycenę',       hint: 'Klient dostał ofertę z cenami',           variant: 'primary' },
    { status: 'APPROVED',   label: 'Zatwierdź bez wyceny', hint: 'Pomiń wycenę — od razu zamawiamy',        variant: 'outline' },
    { status: 'CANCELLED',  label: 'Anuluj',              hint: 'Rezygnujemy z zamówienia',                variant: 'danger'  },
  ],
  QUOTE_SENT: [
    { status: 'APPROVED',   label: 'Klient zatwierdził',  hint: 'Klient zaakceptował wycenę',              variant: 'primary' },
    { status: 'CANCELLED',  label: 'Klient odrzucił',     hint: 'Klient nie zaakceptował oferty',          variant: 'danger'  },
  ],
  APPROVED:   [
    { status: 'ORDERED',    label: 'Zamówione u dostawcy', hint: 'Wysłaliśmy PO do dostawcy',              variant: 'primary' },
    { status: 'CANCELLED',  label: 'Anuluj',              hint: 'Cofnij przed wysyłką do dostawcy',        variant: 'danger'  },
  ],
  ORDERED:    [
    { status: 'IN_TRANSIT', label: 'W drodze',            hint: 'Dostawca potwierdził wysyłkę',            variant: 'primary' },
    { status: 'DELIVERED',  label: 'Dostarczone bezpośrednio', hint: 'Pominięto status W drodze',         variant: 'outline' },
    { status: 'CANCELLED',  label: 'Dostawca anulował',   hint: 'Brak towaru / inny problem',              variant: 'danger'  },
  ],
  IN_TRANSIT: [
    { status: 'DELIVERED',  label: 'Dostarczone',         hint: 'Towar u klienta / w magazynie',           variant: 'primary' },
  ],
  DELIVERED:  [
    { status: 'INVOICED',   label: 'Zafakturowane',       hint: 'Wystawiliśmy fakturę klientowi',          variant: 'primary' },
  ],
  INVOICED:   [],
  CANCELLED:  [],
};

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

  const updateStatus = useMutation({
    mutationFn: async (status: string) => (await api.post(`/orders/${id}/status`, { status })).data,
    onSuccess: (_d, status) => {
      toast.success(`Status zmieniony na ${ORDER_STATUS_LABEL[status]?.label ?? status}`);
      qc.invalidateQueries({ queryKey: ['orders', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Błąd zmiany statusu'),
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
          {/* Status workflow — "co dalej" — DRAFT→QUOTE_SENT→APPROVED→ORDERED→IN_TRANSIT→DELIVERED→INVOICED */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                Co dalej?
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(STATUS_NEXT[o.status]?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 text-[13px] text-tx2">
                  {o.status === 'INVOICED' ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-tx3" />}
                  {o.status === 'INVOICED'
                    ? 'Zamówienie zafakturowane — proces zakończony.'
                    : o.status === 'CANCELLED'
                      ? 'Zamówienie anulowane.'
                      : 'Brak dalszych akcji dla tego statusu.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {STATUS_NEXT[o.status]!.map((next) => (
                    <button
                      key={next.status}
                      type="button"
                      disabled={updateStatus.isPending}
                      onClick={async () => {
                        const danger = next.variant === 'danger';
                        const ok = !danger || await confirmDialog({
                          title: `${next.label}?`,
                          message: next.hint,
                          confirmLabel: next.label,
                          danger: true,
                        });
                        if (ok) updateStatus.mutate(next.status);
                      }}
                      className="text-left p-3 rounded-[var(--r-s)] border press transition-colors"
                      style={{
                        borderColor: next.variant === 'danger' ? 'var(--er)' : next.variant === 'primary' ? 'var(--pri)' : 'var(--bd)',
                        background: next.variant === 'primary' ? 'color-mix(in srgb, var(--pri) 6%, var(--sf))' : 'var(--sf)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="text-[13px] font-semibold"
                          style={{ color: next.variant === 'danger' ? 'var(--er)' : next.variant === 'primary' ? 'var(--pri)' : 'var(--tx)' }}
                        >
                          {next.label}
                        </span>
                        {updateStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-tx3" /> : <ArrowRight className="h-3.5 w-3.5 text-tx3" />}
                      </div>
                      <p className="text-[11px] text-tx3 leading-snug">{next.hint}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
