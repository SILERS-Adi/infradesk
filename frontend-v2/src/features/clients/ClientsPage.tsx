import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, Building2, ExternalLink, Server as ServerIcon, MapPin, Ticket as TicketIcon,
  X, Loader2, Copy, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface ClientRow {
  relationId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  billingType: 'HOURLY' | 'SUBSCRIPTION' | 'HYBRID';
  hourlyRateNet: string | null;
  client: {
    id: string;
    slug: string;
    name: string;
    taxId: string | null;
    plan: string;
    city: string | null;
    email: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    isActive: boolean;
    createdAt: string;
    _count: { locations: number; devices: number; tickets: number; memberships: number };
  };
  risk: { score: number; trend7d: number } | null;
}

export function ClientsPage() {
  const [view, setView] = useViewPreference('clients', 'visual');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
  });

  const clients = data?.clients ?? [];

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Firmy klientów</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {clients.length > 0 ? `${clients.length} ${clients.length === 1 ? 'firma' : 'firm'}` : 'Brak klientów'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj klienta</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : clients.length === 0 ? (
        <Card className="p-10 text-center">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak klientów</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwszą firmę, którą obsługujesz — dostanie własną subdomenę.</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Dodaj pierwszego klienta</Button>
        </Card>
      ) : view === 'visual' ? (
        <ClientsGrid clients={clients} />
      ) : (
        <ClientsTable clients={clients} />
      )}

      {showCreate && <CreateClientModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function riskBadgeVariant(score: number): 'success' | 'warning' | 'danger' {
  if (score <= 30) return 'success';
  if (score <= 65) return 'warning';
  return 'danger';
}

function ClientsGrid({ clients }: { clients: ClientRow[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {clients.map((c) => (
        <Link key={c.relationId} to={`/clients/${c.client.id}`} className="block">
          <Card className="p-4 h-full">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0 text-[14px] font-bold text-white"
                  style={{ background: c.client.primaryColor ? `linear-gradient(135deg, ${c.client.primaryColor}, ${c.client.primaryColor}cc)` : 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
                >
                  {c.client.logoUrl ? <img src={c.client.logoUrl} alt="" className="w-full h-full object-contain rounded-[var(--r-s)]" /> : c.client.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-tx truncate">{c.client.name}</h3>
                  <p className="text-[11px] text-tx3 font-mono truncate">{c.client.slug}.infradesk.pl</p>
                </div>
              </div>
              {c.risk && (
                <Badge variant={riskBadgeVariant(c.risk.score)} className="shrink-0">
                  Risk {c.risk.score}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] mb-3">
              <Stat icon={MapPin} value={c.client._count.locations} label="Lokalizacje" />
              <Stat icon={ServerIcon} value={c.client._count.devices} label="Urządzenia" />
              <Stat icon={TicketIcon} value={c.client._count.tickets} label="Zgłoszenia" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-bd text-[11px] text-tx3">
              <span>{c.billingType === 'HOURLY' ? `${c.hourlyRateNet ?? '—'} PLN/h` : c.billingType}</span>
              {c.risk && c.risk.trend7d !== 0 && (
                <span className={cn(c.risk.trend7d > 0 ? 'text-er' : 'text-ok')}>
                  {c.risk.trend7d > 0 ? '↑' : '↓'} {Math.abs(c.risk.trend7d)} pkt
                </span>
              )}
              {c.status !== 'ACTIVE' && <Badge variant="warning">{c.status}</Badge>}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof MapPin; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-tx2">
      <Icon className="h-3 w-3 text-tx3 shrink-0" />
      <span className="font-semibold text-tx">{value}</span>
      <span className="text-tx3 text-[10px]">{label}</span>
    </div>
  );
}

function ClientsTable({ clients }: { clients: ClientRow[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd">
          <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <th className="px-4 py-2.5 font-bold">Firma</th>
            <th className="px-4 py-2.5 font-bold">Subdomena</th>
            <th className="px-4 py-2.5 font-bold">NIP</th>
            <th className="px-4 py-2.5 font-bold">Risk</th>
            <th className="px-4 py-2.5 font-bold">Lok.</th>
            <th className="px-4 py-2.5 font-bold">Urz.</th>
            <th className="px-4 py-2.5 font-bold">Zgł.</th>
            <th className="px-4 py-2.5 font-bold">Stawka</th>
            <th className="px-4 py-2.5 font-bold">Plan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {clients.map((c) => (
            <tr key={c.relationId} className="hover:bg-sf-h">
              <td className="px-4 py-3 text-tx">
                <Link to={`/clients/${c.client.id}`} className="hover:text-pri font-medium">{c.client.name}</Link>
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-tx3">{c.client.slug}</td>
              <td className="px-4 py-3 text-tx3 text-[11px]">{c.client.taxId ?? '—'}</td>
              <td className="px-4 py-3">{c.risk ? <Badge variant={riskBadgeVariant(c.risk.score)}>{c.risk.score}</Badge> : <span className="text-tx3">—</span>}</td>
              <td className="px-4 py-3 text-tx2 tabular-nums">{c.client._count.locations}</td>
              <td className="px-4 py-3 text-tx2 tabular-nums">{c.client._count.devices}</td>
              <td className="px-4 py-3 text-tx2 tabular-nums">{c.client._count.tickets}</td>
              <td className="px-4 py-3 text-tx3 text-[11px]">{c.hourlyRateNet ? `${c.hourlyRateNet} PLN/h` : c.billingType}</td>
              <td className="px-4 py-3"><Badge variant="neutral">{c.client.plan}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const clientSchema = z.object({
  name: z.string().min(2, 'Min. 2 znaki').max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Małe litery, cyfry, myślniki, 3-40 znaków').optional().or(z.literal('')),
  taxId: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),

  ownerEmail: z.string().email('Nieprawidłowy email'),
  ownerFirstName: z.string().min(1, 'Imię wymagane').max(100),
  ownerLastName: z.string().min(1, 'Nazwisko wymagane').max(100),
  ownerPhone: z.string().optional(),

  billingType: z.enum(['HOURLY', 'SUBSCRIPTION', 'HYBRID']).default('HOURLY'),
  hourlyRateNet: z.coerce.number().nonnegative().optional(),
  monthlyNet: z.coerce.number().nonnegative().optional(),
});
type ClientForm = z.infer<typeof clientSchema>;

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ client: { name: string; slug: string }; inviteUrl: string } | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { billingType: 'HOURLY' },
  });
  const name = watch('name');
  const slug = watch('slug');

  // Auto-slug
  const autoSlug = name ? name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) : '';

  const mutation = useMutation({
    mutationFn: async (data: ClientForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (!data.slug || data.slug === '') payload.slug = undefined;
      if (!data.email || data.email === '') payload.email = undefined;
      return (await api.post('/clients', payload)).data;
    },
    onSuccess: (data) => {
      toast.success('Klient dodany');
      qc.invalidateQueries({ queryKey: ['clients'] });
      setResult(data);
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd tworzenia klienta');
    },
  });

  if (result) {
    return (
      <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale"
            style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
          >
            <div className="px-6 py-8 text-center">
              <div
                className="w-14 h-14 rounded-[var(--r)] mx-auto mb-4 flex items-center justify-center anim-glow"
                style={{ background: 'linear-gradient(135deg, var(--ok), #059669)' }}
              >
                <Building2 className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-[18px] font-bold text-tx mb-2">{result.client.name} dodany</h2>
              <p className="text-[13px] text-tx3 mb-4">Klient dostanie subdomenę i link do pierwszego logowania:</p>
              <div className="bg-sf2 rounded-[var(--r-s)] px-3 py-2 mb-4 flex items-center gap-2">
                <span className="text-[11px] text-tx2 truncate flex-1 text-left">{result.inviteUrl}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(result.inviteUrl); toast.success('Skopiowane'); }}
                  className="p-1.5 rounded-[6px] hover:bg-sf-h press"
                >
                  <Copy className="h-3.5 w-3.5 text-tx3" />
                </button>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-[var(--r-s)] mb-4 text-left" style={{ background: 'var(--wn-l)', border: '1px solid var(--wn-b)' }}>
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--wn)' }} />
                <p className="text-[11px] text-tx2">
                  SMTP nie jest jeszcze podpięte (Sprint 6) — skopiuj link i wyślij ręcznie. Link ważny 7 dni.
                </p>
              </div>
              <Button className="w-full" onClick={onClose}>Zamknij</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowy klient</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-5 overflow-y-auto" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Dane firmy</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                  <Input {...register('name')} placeholder="np. Dwór Osmolice" />
                  {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Subdomena</label>
                  <div className="flex items-center gap-2">
                    <Input {...register('slug')} placeholder={autoSlug || 'np. dworosmolice'} className="flex-1" />
                    <span className="text-[12px] text-tx3">.infradesk.pl</span>
                    {!slug && autoSlug && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setValue('slug', autoSlug)}>
                        Użyj {autoSlug}
                      </Button>
                    )}
                  </div>
                  {errors.slug && <p className="text-[11px] text-er mt-1">{errors.slug.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">NIP</label>
                    <Input {...register('taxId')} placeholder="123-456-78-90" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto</label>
                    <Input {...register('city')} placeholder="Warszawa" />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-bd pt-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Osoba kontaktowa (OwnerKlient)</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Imię *</label>
                    <Input {...register('ownerFirstName')} placeholder="Anna" />
                    {errors.ownerFirstName && <p className="text-[11px] text-er mt-1">{errors.ownerFirstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwisko *</label>
                    <Input {...register('ownerLastName')} placeholder="Nowak" />
                    {errors.ownerLastName && <p className="text-[11px] text-er mt-1">{errors.ownerLastName.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Email *</label>
                  <Input type="email" {...register('ownerEmail')} placeholder="anna@dworosmolice.pl" />
                  {errors.ownerEmail && <p className="text-[11px] text-er mt-1">{errors.ownerEmail.message}</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Telefon</label>
                  <Input {...register('ownerPhone')} placeholder="501 234 567" />
                </div>
              </div>
            </div>

            <div className="border-t border-bd pt-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Rozliczenia</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
                  <select
                    {...register('billingType')}
                    className="flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
                  >
                    <option value="HOURLY">Godzinowo</option>
                    <option value="SUBSCRIPTION">Abonament</option>
                    <option value="HYBRID">Hybryda</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Stawka PLN/h</label>
                  <Input type="number" step="0.01" {...register('hourlyRateNet')} placeholder="150" />
                </div>
              </div>
            </div>

          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button
              type="button"
              onClick={handleSubmit((d) => mutation.mutate(d))}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Utwórz klienta <ExternalLink className="h-3.5 w-3.5" /></>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
