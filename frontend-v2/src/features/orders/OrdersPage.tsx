import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, ShoppingCart, Trash2, X, Loader2, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatDatePl } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  supplierName: string | null;
  totalNet: string;
  totalGross: string;
  vatRate: string;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; unitNet: string; totalNet: string }>;
  linkedTicket: { id: string; ticketNumber: string; title: string; status: string } | null;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('orders', 'visual');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ orders: Order[] }>({
    queryKey: ['orders'],
    queryFn: async () => (await api.get('/orders')).data,
  });

  const orders = data?.orders ?? [];

  function handleAdd() {
    if (view === 'visual') setShowCreate(true);
    else navigate('/orders/new');
  }

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Zamówienia klientów</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {orders.length > 0 ? `${orders.length} zamówień` : 'Brak zamówień'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4" /> Nowe
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-10 text-center">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak zamówień</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwsze zamówienie części lub sprzętu.</p>
        </Card>
      ) : view === 'visual' ? (
        <OrdersGrid orders={orders} />
      ) : (
        <OrdersTable orders={orders} />
      )}

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export function OrderNewPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-4 anim-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-[22px] font-bold text-tx">Nowe zamówienie</h1>
      <CreateOrderModal variant="page" onClose={() => navigate('/orders')} />
    </div>
  );
}

function OrdersGrid({ orders }: { orders: Order[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {orders.map((o) => (
        <Card key={o.id} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[11px] font-mono text-tx3">{o.orderNumber}</span>
            <StatusPill entity="order" value={o.status} />
          </div>
          <h3 className="text-[14px] font-semibold text-tx mb-1 truncate">{o.title}</h3>
          {o.supplierName && <p className="text-[11px] text-tx3 mb-2">Dostawca: {o.supplierName}</p>}
          {o.linkedTicket && (
            <div className="flex items-center gap-1 mb-2 text-[10px] text-tx3">
              <span>Origin:</span>
              <Link to={`/tickets/${o.linkedTicket.id}`}>
                <Badge variant="accent" className="text-[9px]">{o.linkedTicket.ticketNumber}</Badge>
              </Link>
            </div>
          )}
          <div className="flex items-end justify-between mt-3">
            <div>
              <p className="text-[10px] text-tx3">Netto</p>
              <p className="text-[16px] font-bold text-tx tabular-nums">{Number(o.totalNet).toFixed(2)} PLN</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-tx3">Pozycje</p>
              <p className="text-[14px] font-semibold text-tx2">{o.items.length}</p>
            </div>
          </div>
          <p className="text-[10px] text-tx3 mt-3 pt-3 border-t border-bd">
            {formatDatePl(o.createdAt)}
          </p>
        </Card>
      ))}
    </div>
  );
}

function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd">
          <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <th className="px-4 py-2.5 font-bold">Nr</th>
            <th className="px-4 py-2.5 font-bold">Tytuł</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
            <th className="px-4 py-2.5 font-bold">Dostawca</th>
            <th className="px-4 py-2.5 font-bold">Ticket</th>
            <th className="px-4 py-2.5 font-bold">Pozycje</th>
            <th className="px-4 py-2.5 font-bold text-right">Netto</th>
            <th className="px-4 py-2.5 font-bold text-right">Brutto</th>
            <th className="px-4 py-2.5 font-bold">Utworzone</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-sf-h transition-colors">
              <td className="px-4 py-3 font-mono text-[11px] text-tx3">{o.orderNumber}</td>
              <td className="px-4 py-3 text-tx">{o.title}</td>
              <td className="px-4 py-3"><StatusPill entity="order" value={o.status} /></td>
              <td className="px-4 py-3 text-tx2">{o.supplierName ?? '—'}</td>
              <td className="px-4 py-3">
                {o.linkedTicket ? (
                  <Link to={`/tickets/${o.linkedTicket.id}`}>
                    <Badge variant="accent">{o.linkedTicket.ticketNumber}</Badge>
                  </Link>
                ) : <span className="text-tx3">—</span>}
              </td>
              <td className="px-4 py-3 text-tx3">{o.items.length}</td>
              <td className="px-4 py-3 text-right tabular-nums text-tx">{Number(o.totalNet).toFixed(2)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-tx">{Number(o.totalGross).toFixed(2)}</td>
              <td className="px-4 py-3 text-[11px] text-tx3">{formatDatePl(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const itemSchema = z.object({
  name: z.string().min(1, 'Nazwa'),
  quantity: z.coerce.number().int().min(1),
  unitNet: z.coerce.number().nonnegative(),
});

const orderSchema = z.object({
  title: z.string().min(2, 'Min. 2 znaki'),
  supplierName: z.string().optional(),
  vatRate: z.coerce.number().min(0).max(100).default(23),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Dodaj przynajmniej 1 pozycję'),
});
type OrderForm = z.infer<typeof orderSchema>;

export function CreateOrderModal({ onClose, variant = 'modal' }: { onClose: () => void; variant?: 'modal' | 'page' }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting } } = useForm<OrderForm>({
    resolver: zodResolver(orderSchema),
    defaultValues: { vatRate: 23, items: [{ name: '', quantity: 1, unitNet: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const mutation = useMutation({
    mutationFn: async (data: OrderForm) => (await api.post('/orders', data)).data,
    onSuccess: () => { toast.success('Zamówienie utworzone'); qc.invalidateQueries({ queryKey: ['orders'] }); onClose(); },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd');
    },
  });

  const watchItems = watch('items');
  const watchVat = watch('vatRate') || 0;
  const totalNet = (watchItems ?? []).reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.unitNet) || 0), 0);
  const totalGross = totalNet * (1 + Number(watchVat) / 100);

  const formBody = (
    <>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Tytuł</label>
        <Input {...register('title')} placeholder="np. Zakup laptopów Dell" />
        {errors.title && <p className="text-[11px] text-er mt-1">{errors.title.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Dostawca</label>
          <Input {...register('supplierName')} placeholder="x-kom, Morele, Action…" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">VAT (%)</label>
          <Input type="number" step="0.01" {...register('vatRate')} />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Opis</label>
        <Textarea rows={2} {...register('description')} placeholder="Uwagi, kontekst biznesowy…" />
      </div>

      {/* Items */}
      <div className="border-t border-bd pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-tx2">Pozycje</label>
          <Button type="button" size="sm" variant="outline" onClick={() => append({ name: '', quantity: 1, unitNet: 0 })}>
            <Plus className="h-3 w-3" /> Dodaj
          </Button>
        </div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
              <Input {...register(`items.${i}.name`)} placeholder="Nazwa" />
              <Input type="number" {...register(`items.${i}.quantity`)} placeholder="Ile" />
              <Input type="number" step="0.01" {...register(`items.${i}.unitNet`)} placeholder="Cena netto" />
              {fields.length > 1 && (
                <button type="button" onClick={() => remove(i)} className="text-tx3 hover:text-er press">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {errors.items && <p className="text-[11px] text-er mt-1">{errors.items.message}</p>}
      </div>

      {/* Totals */}
      <div className="border-t border-bd pt-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-tx3">Suma</span>
        <div className="text-right">
          <p className="text-[11px] text-tx3">Netto: <span className="font-bold text-tx tabular-nums">{totalNet.toFixed(2)}</span></p>
          <p className="text-[13px] text-tx font-bold tabular-nums">{totalGross.toFixed(2)} PLN brutto</p>
        </div>
      </div>
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button
        type="button"
        onClick={handleSubmit((d) => mutation.mutate(d))}
        disabled={isSubmitting}
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz zamówienie'}
      </Button>
    </>
  );

  if (variant === 'page') {
    return (
      <Card className="p-0 overflow-hidden">
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          {formBody}
        </form>
        <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h">
          {actions}
        </div>
      </Card>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale max-h-[85vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowe zamówienie</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            {formBody}
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            {actions}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
