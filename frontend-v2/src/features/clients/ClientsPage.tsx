import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, Building2, ExternalLink, Server as ServerIcon, MapPin, Ticket as TicketIcon,
  X, Loader2, Copy, AlertTriangle, FileText, Wand2, Sparkles, ChevronLeft, ChevronRight, Check, Pencil,
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
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('clients', 'visual');
  const [showCreate, setShowCreate] = useState(false);
  const [editClient, setEditClient] = useState<ClientRow | null>(null);

  const { data, isLoading } = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
  });

  const clients = data?.clients ?? [];

  function handleAdd() {
    if (view === 'visual') setShowCreate(true);
    else navigate('/clients/new');
  }

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
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj klienta</Button>
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
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj pierwszego klienta</Button>
        </Card>
      ) : view === 'visual' ? (
        <ClientsGrid clients={clients} onEdit={setEditClient} />
      ) : (
        <ClientsTable clients={clients} onEdit={setEditClient} />
      )}

      {showCreate && <CreateClientModal onClose={() => setShowCreate(false)} />}
      {editClient && <EditClientModal client={editClient} onClose={() => setEditClient(null)} />}
    </div>
  );
}

export function ClientNewPage() {
  const navigate = useNavigate();
  return (
    <div className="anim-up">
      <div className="max-w-3xl mx-auto mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>
      </div>
      <CreateClientModal onClose={() => navigate('/clients')} />
    </div>
  );
}

function riskBadgeVariant(score: number): 'success' | 'warning' | 'danger' {
  if (score <= 30) return 'success';
  if (score <= 65) return 'warning';
  return 'danger';
}

function ClientsGrid({ clients, onEdit }: { clients: ClientRow[]; onEdit: (c: ClientRow) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {clients.map((c) => (
        <div key={c.relationId} className="relative group">
          <Link to={`/clients/${c.client.id}`} className="block">
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
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(c); }}
          className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 bg-sf border border-bd hover:border-pri text-tx3 hover:text-pri transition-all"
          title="Edytuj firmę"
        >
          <Pencil size={12} />
        </button>
        </div>
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

function ClientsTable({ clients, onEdit }: { clients: ClientRow[]; onEdit: (c: ClientRow) => void }) {
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
            <th className="px-4 py-2.5 font-bold w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {clients.map((c) => (
            <tr key={c.relationId} className="hover:bg-sf-h group">
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
              <td className="px-4 py-3">
                <button type="button" onClick={() => onEdit(c)} className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri opacity-60 group-hover:opacity-100" title="Edytuj">
                  <Pencil size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function EditClientModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: client.client.name,
    taxId: client.client.taxId ?? '',
    city: client.client.city ?? '',
    email: client.client.email ?? '',
    phone: '',
    website: '',
    addressLine1: '',
    postalCode: '',
    billingType: client.billingType,
    billingPeriod: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
    hourlyRateNet: client.hourlyRateNet ?? '',
    overageRateNet: '' as string | number,
    monthlyNet: '' as string | number,
    monthlyHours: '' as string | number,
    billingIncrementMin: 15,
    status: client.status,
  });
  const [ceidgLoading, setCeidgLoading] = useState(false);

  // Fetch relation detail to pre-fill billing fields beyond what list returns
  const { data: detail } = useQuery<{ relation: { billingPeriod?: string; overageRateNet?: string | null; monthlyNet?: string | null; monthlyHours?: number | null; billingIncrementMin?: number; client?: { phone?: string | null; website?: string | null; addressLine1?: string | null; postalCode?: string | null } } }>({
    queryKey: ['client-detail', client.client.id],
    queryFn: async () => (await api.get(`/clients/${client.client.id}`)).data,
  });
  useEffect(() => {
    if (!detail?.relation) return;
    const r = detail.relation;
    const c = r.client ?? {};
    setForm((f) => ({
      ...f,
      monthlyNet: r.monthlyNet ?? '',
      monthlyHours: r.monthlyHours ?? '',
      overageRateNet: r.overageRateNet ?? '',
      billingIncrementMin: r.billingIncrementMin ?? 15,
      billingPeriod: (r.billingPeriod as 'MONTHLY' | 'QUARTERLY' | 'YEARLY') ?? 'MONTHLY',
      phone: c.phone ?? f.phone,
      website: c.website ?? f.website,
      addressLine1: c.addressLine1 ?? f.addressLine1,
      postalCode: c.postalCode ?? f.postalCode,
    }));
  }, [detail]);

  async function fetchCeidg() {
    const cleaned = form.taxId.replace(/[^0-9]/g, '');
    if (cleaned.length !== 10) { toast.error('Podaj NIP (10 cyfr)'); return; }
    setCeidgLoading(true);
    try {
      const res = await api.get<{ found: boolean; data?: { name: string; city: string | null; addressLine1: string | null; postalCode: string | null } }>(`/clients/lookup/ceidg?nip=${cleaned}`);
      if (!res.data.found || !res.data.data) { toast.error('Nie znaleziono w CEIDG'); return; }
      const d = res.data.data;
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        city: d.city ?? f.city,
        addressLine1: d.addressLine1 ?? f.addressLine1,
        postalCode: d.postalCode ?? f.postalCode,
      }));
      toast.success(`Pobrano: ${d.name}`);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd CEIDG';
      toast.error(msg);
    } finally { setCeidgLoading(false); }
  }

  const mutation = useMutation({
    mutationFn: async () => (await api.patch(`/clients/${client.client.id}`, {
      status: form.status,
      billingType: form.billingType,
      billingPeriod: form.billingPeriod,
      hourlyRateNet: form.hourlyRateNet === '' ? null : Number(form.hourlyRateNet),
      overageRateNet: form.overageRateNet === '' ? null : Number(form.overageRateNet),
      monthlyNet: form.monthlyNet === '' ? null : Number(form.monthlyNet),
      monthlyHours: form.monthlyHours === '' ? null : Number(form.monthlyHours),
      billingIncrementMin: Number(form.billingIncrementMin) || 15,
      company: {
        name: form.name,
        taxId: form.taxId || null,
        city: form.city || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        addressLine1: form.addressLine1 || null,
        postalCode: form.postalCode || null,
      },
    })).data,
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-detail', client.client.id] });
      qc.invalidateQueries({ queryKey: ['billing-summary'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edytuj firmę — {client.client.name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} style={MODAL_BODY_STYLE} className="space-y-5">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Dane firmy</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">NIP</label>
                    <div className="flex items-center gap-2">
                      <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className="flex-1" />
                      <Button type="button" size="sm" variant="ghost" onClick={fetchCeidg} disabled={ceidgLoading} title="Pobierz z CEIDG po NIP">
                        {ceidgLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3" /> CEIDG</>}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto</label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Adres</label>
                    <Input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} placeholder="ul. Przykładowa 1" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Kod pocztowy</label>
                    <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="00-000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Email firmy</label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Telefon</label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Strona www</label>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://firma.pl" />
                </div>
              </div>
            </div>
            <div className="border-t border-bd pt-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-3">Rozliczenia</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
                  <select
                    value={form.billingType}
                    onChange={(e) => setForm({ ...form, billingType: e.target.value as typeof form.billingType })}
                    className="flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
                  >
                    <option value="HOURLY">Godzinowo</option>
                    <option value="SUBSCRIPTION">Abonament</option>
                    <option value="HYBRID">Abonament + godziny ponad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Okres rozliczenia</label>
                  <select
                    value={form.billingPeriod}
                    onChange={(e) => setForm({ ...form, billingPeriod: e.target.value as typeof form.billingPeriod })}
                    className="flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
                  >
                    <option value="MONTHLY">Miesięczny</option>
                    <option value="QUARTERLY">Kwartalny</option>
                    <option value="YEARLY">Roczny</option>
                  </select>
                </div>
              </div>

              {(form.billingType === 'SUBSCRIPTION' || form.billingType === 'HYBRID') && (
                <div className="mt-3 p-3 rounded-[var(--r-s)] bg-sf-h border border-bd">
                  <p className="text-[10px] font-semibold text-tx3 uppercase mb-2">Abonament</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-tx3 mb-1">Kwota netto / okres</label>
                      <Input type="number" step="0.01" value={form.monthlyNet} onChange={(e) => setForm({ ...form, monthlyNet: e.target.value })} placeholder="1500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-tx3 mb-1">Ilość godzin w abonamencie</label>
                      <Input type="number" step="1" value={form.monthlyHours} onChange={(e) => setForm({ ...form, monthlyHours: e.target.value })} placeholder="10" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-tx3 mb-1">Stawka ponad limit PLN/h</label>
                      <Input type="number" step="0.01" value={form.overageRateNet} onChange={(e) => setForm({ ...form, overageRateNet: e.target.value })} placeholder="150" />
                    </div>
                    <div className="text-[11px] text-tx3 pt-6">
                      Po przekroczeniu {form.monthlyHours || '—'} h/okres<br/>każda następna po {form.overageRateNet || '—'} PLN
                    </div>
                  </div>
                </div>
              )}

              {(form.billingType === 'HOURLY' || form.billingType === 'HYBRID') && (
                <div className="mt-3 p-3 rounded-[var(--r-s)] bg-sf-h border border-bd">
                  <p className="text-[10px] font-semibold text-tx3 uppercase mb-2">Rozliczenie godzinowe</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-tx3 mb-1">Stawka PLN/h</label>
                      <Input type="number" step="0.01" value={form.hourlyRateNet} onChange={(e) => setForm({ ...form, hourlyRateNet: e.target.value })} placeholder="120" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-tx3 mb-1">Naliczanie co [min]</label>
                      <Input type="number" step="1" value={form.billingIncrementMin} onChange={(e) => setForm({ ...form, billingIncrementMin: Number(e.target.value) || 15 })} placeholder="15" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                  className="flex h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
                >
                  <option value="ACTIVE">Aktywny</option>
                  <option value="SUSPENDED">Zawieszony</option>
                  <option value="TERMINATED">Zakończony</option>
                </select>
              </div>
            </div>
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || form.name.length < 2}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz zmiany'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

type AddMode = null | 'form' | 'wizard' | 'ai';

// Inline-styled modal shell — bypasses any Tailwind purge issues with arbitrary values.
const MODAL_SHELL_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  margin: 'auto',
  height: 'fit-content',
  zIndex: 50,
  width: 'min(92vw, 36rem)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--sf)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r-xl)',
  boxShadow: 'var(--sh4)',
  overflow: 'hidden',
};

const MODAL_BODY_STYLE: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: '20px 24px',
};

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<AddMode>(null);
  const [result, setResult] = useState<{ client: { name: string; slug: string }; inviteUrl: string } | null>(null);
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<ClientForm>({
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

  // Success screen
  if (result) {
    return (
      <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content style={{ ...MODAL_SHELL_STYLE, width: 'min(92vw, 28rem)' }}>
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div
                className="w-14 h-14 rounded-[var(--r)] mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--ok), #059669)' }}
              >
                <Building2 className="h-7 w-7 text-white" />
              </div>
              <Dialog.Title className="text-[18px] font-bold text-tx mb-2">{result.client.name} dodany</Dialog.Title>
              <p className="text-[13px] text-tx3 mb-4">Klient dostanie subdomenę i link do pierwszego logowania:</p>
              <div className="bg-sf2 rounded-[var(--r-s)] px-3 py-2 mb-4 flex items-center gap-2">
                <span className="text-[11px] text-tx2 truncate flex-1 text-left">{result.inviteUrl}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(result.inviteUrl); toast.success('Skopiowane'); }}
                  className="p-1.5 rounded-[6px] hover:bg-sf-h"
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

  // Mode selector
  if (mode === null) {
    return (
      <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content style={MODAL_SHELL_STYLE}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
              <Dialog.Title className="text-[16px] font-bold text-tx">Jak chcesz dodać klienta?</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
              </Dialog.Close>
            </div>
            <div style={MODAL_BODY_STYLE}>
              <div className="grid grid-cols-1 gap-3">
                <ModeCard
                  icon={FileText}
                  title="Formularz"
                  desc="Jeden ekran, wszystkie pola naraz. Dla wprawionych."
                  color="var(--pri)"
                  onClick={() => setMode('form')}
                />
                <ModeCard
                  icon={Wand2}
                  title="Wizard — krok po kroku"
                  desc="3 kroki: firma → kontakt → rozliczenia. Idealny przy pierwszym dodawaniu."
                  color="var(--in)"
                  onClick={() => setMode('wizard')}
                />
                <ModeCard
                  icon={Sparkles}
                  title="AI — wklej tekst"
                  desc="Wklej maila, wizytówkę albo dane z CEIDG. Iris wypełni formularz."
                  color="var(--wn)"
                  onClick={() => setMode('ai')}
                  badge="BETA"
                />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  // AI mode
  if (mode === 'ai') {
    return (
      <AiExtractMode
        onBack={() => setMode(null)}
        onClose={onClose}
        onExtracted={(data) => {
          reset({ ...data, billingType: 'HOURLY' } as ClientForm);
          setMode('form');
        }}
      />
    );
  }

  // Wizard mode
  if (mode === 'wizard') {
    return (
      <WizardMode
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        handleSubmit={handleSubmit}
        mutation={mutation}
        autoSlug={autoSlug}
        slug={slug}
        isSubmitting={isSubmitting}
        onBack={() => setMode(null)}
        onClose={onClose}
      />
    );
  }

  // Full form mode
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMode(null)} className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h" title="Wróć do wyboru trybu">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Dialog.Title className="text-[16px] font-bold text-tx">Nowy klient — formularz</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={MODAL_BODY_STYLE} className="space-y-5">
            <FormSectionFirma register={register} setValue={setValue} watch={watch} errors={errors} autoSlug={autoSlug} slug={slug} />
            <div className="border-t border-bd pt-5"><FormSectionContact register={register} errors={errors} /></div>
            <div className="border-t border-bd pt-5"><FormSectionBilling register={register} /></div>
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="button" onClick={handleSubmit((d) => mutation.mutate(d))} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Utwórz klienta <ExternalLink className="h-3.5 w-3.5" /></>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModeCard({
  icon: Icon, title, desc, color, onClick, badge,
}: { icon: typeof FileText; title: string; desc: string; color: string; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 p-4 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors text-left"
    >
      <div
        className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-tx">{title}</h3>
          {badge && <Badge variant="warning">{badge}</Badge>}
        </div>
        <p className="text-[12px] text-tx3 mt-0.5">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-tx3 shrink-0 mt-1" />
    </button>
  );
}

function AiExtractMode({
  onBack, onClose, onExtracted,
}: { onBack: () => void; onClose: () => void; onExtracted: (data: Partial<ClientForm>) => void }) {
  const [text, setText] = useState('');
  const [extracting, setExtracting] = useState(false);

  async function extract() {
    if (!text.trim()) return;
    setExtracting(true);
    try {
      const prompt = `Wyciągnij dane klienta z poniższego tekstu i zwróć CZYSTY JSON (bez komentarzy, bez markdown) z polami:
{
  "name": "nazwa firmy",
  "taxId": "NIP bez kresek" lub null,
  "city": "miasto" lub null,
  "email": "email firmy" lub null,
  "phone": "telefon firmy" lub null,
  "ownerFirstName": "imię osoby kontaktowej",
  "ownerLastName": "nazwisko",
  "ownerEmail": "email osoby kontaktowej",
  "ownerPhone": "telefon osoby kontaktowej" lub null
}
Jeśli jakieś pole nie da się ustalić — użyj null. Zwróć tylko JSON, żadnych cudzysłowów wokół.

TEKST:
${text}`;
      const res = await api.post<{ text: string }>('/ai/chat', {
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: prompt }],
      });
      const match = res.data.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI nie zwróciło JSON');
      const parsed = JSON.parse(match[0]);
      const data: Partial<ClientForm> = {
        name: parsed.name ?? '',
        taxId: parsed.taxId ?? undefined,
        city: parsed.city ?? undefined,
        email: parsed.email ?? undefined,
        phone: parsed.phone ?? undefined,
        ownerFirstName: parsed.ownerFirstName ?? '',
        ownerLastName: parsed.ownerLastName ?? '',
        ownerEmail: parsed.ownerEmail ?? '',
        ownerPhone: parsed.ownerPhone ?? undefined,
      };
      toast.success('AI wypełnił formularz — zweryfikuj i zapisz');
      onExtracted(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Błąd AI';
      toast.error(`Nie udało się wyciągnąć danych: ${msg}`);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onBack} className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: 'var(--wn)' }} /> Dodaj klienta przez AI
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <div style={MODAL_BODY_STYLE} className="space-y-3">
            <p className="text-[13px] text-tx2">
              Wklej maila, wizytówkę, stopkę lub dane z CEIDG/GUS. Iris wyciągnie nazwę firmy, NIP, kontakt i wypełni formularz.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx font-mono resize-none"
              placeholder="Dzień dobry, jestem Anna Nowak z Dwór Osmolice Sp. z o.o. NIP 1234567890, Warszawa. Telefon 501 234 567, email anna@dworosmolice.pl..."
              disabled={extracting}
            />
            <div className="flex items-start gap-2 p-3 rounded-[var(--r-s)]" style={{ background: 'var(--in-l)', border: '1px solid var(--in-b)' }}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--in)' }} />
              <p className="text-[11px] text-tx2">
                AI użyje modelu Haiku (~0.001 PLN). Po wyciągnięciu danych zweryfikujesz je przed zapisem.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            <Button type="button" variant="ghost" onClick={onBack}>Wstecz</Button>
            <Button type="button" onClick={extract} disabled={extracting || !text.trim()}>
              {extracting ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizuję…</> : <><Sparkles className="h-3.5 w-3.5" /> Wyciągnij dane</>}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type WizardProps = {
  register: ReturnType<typeof useForm<ClientForm>>['register'];
  watch: ReturnType<typeof useForm<ClientForm>>['watch'];
  setValue: ReturnType<typeof useForm<ClientForm>>['setValue'];
  errors: ReturnType<typeof useForm<ClientForm>>['formState']['errors'];
  handleSubmit: ReturnType<typeof useForm<ClientForm>>['handleSubmit'];
  mutation: { mutate: (d: ClientForm) => void };
  autoSlug: string;
  slug: string | undefined;
  isSubmitting: boolean;
  onBack: () => void;
  onClose: () => void;
};

function WizardMode({
  register, setValue, watch, errors, handleSubmit, mutation, autoSlug, slug, isSubmitting, onBack, onClose,
}: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const STEPS = [
    { n: 1, title: 'Firma', desc: 'Nazwa, NIP, miasto' },
    { n: 2, title: 'Kontakt', desc: 'Osoba kontaktowa' },
    { n: 3, title: 'Rozliczenia', desc: 'Model i stawka' },
  ] as const;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onBack} className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
                <Wand2 className="h-4 w-4" style={{ color: 'var(--in)' }} /> Wizard — krok {step}/3
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-3 border-b border-bd bg-sf-h flex items-center gap-2" style={{ flexShrink: 0 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{
                    background: step >= s.n ? 'var(--pri)' : 'var(--sf2)',
                    color: step >= s.n ? '#fff' : 'var(--tx3)',
                    border: step === s.n ? '2px solid var(--pri)' : '1px solid var(--bd)',
                  }}
                >
                  {step > s.n ? <Check className="h-3.5 w-3.5" /> : s.n}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <div className="text-[11px] font-semibold text-tx truncate">{s.title}</div>
                  <div className="text-[9px] text-tx3 truncate">{s.desc}</div>
                </div>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-bd" />}
              </div>
            ))}
          </div>

          <div style={MODAL_BODY_STYLE}>
            {step === 1 && <FormSectionFirma register={register} setValue={setValue} watch={watch} errors={errors} autoSlug={autoSlug} slug={slug} />}
            {step === 2 && <FormSectionContact register={register} errors={errors} />}
            {step === 3 && <FormSectionBilling register={register} />}
          </div>

          <div className="px-6 py-4 border-t border-bd flex items-center justify-between gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => step > 1 ? setStep((step - 1) as 1 | 2) : onBack()}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {step > 1 ? 'Wstecz' : 'Tryby'}
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={() => setStep((step + 1) as 2 | 3)}>
                Dalej <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit((d) => mutation.mutate(d))}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Utwórz klienta <Check className="h-3.5 w-3.5" /></>}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormSectionFirma({
  register, setValue, watch, errors, autoSlug, slug,
}: {
  register: ReturnType<typeof useForm<ClientForm>>['register'];
  setValue: ReturnType<typeof useForm<ClientForm>>['setValue'];
  watch: ReturnType<typeof useForm<ClientForm>>['watch'];
  errors: ReturnType<typeof useForm<ClientForm>>['formState']['errors'];
  autoSlug: string;
  slug: string | undefined;
}) {
  const [fetching, setFetching] = useState(false);
  const nip = watch('taxId');

  async function fetchCeidg() {
    const cleaned = (nip ?? '').replace(/[^0-9]/g, '');
    if (cleaned.length !== 10) { toast.error('Podaj NIP (10 cyfr)'); return; }
    setFetching(true);
    try {
      const res = await api.get<{ found: boolean; data?: { name: string; taxId: string; city: string | null; addressLine1: string | null; postalCode: string | null; ownerFirstName: string; ownerLastName: string } }>(`/clients/lookup/ceidg?nip=${cleaned}`);
      if (!res.data.found || !res.data.data) { toast.error('Nie znaleziono w CEIDG'); return; }
      const d = res.data.data;
      if (d.name) setValue('name', d.name);
      if (d.city) setValue('city', d.city);
      if (d.ownerFirstName) setValue('ownerFirstName', d.ownerFirstName);
      if (d.ownerLastName) setValue('ownerLastName', d.ownerLastName);
      toast.success(`Pobrano: ${d.name}`);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd CEIDG';
      toast.error(msg);
    } finally { setFetching(false); }
  }

  return (
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
            <div className="flex items-center gap-2">
              <Input {...register('taxId')} placeholder="1234567890" className="flex-1" />
              <Button type="button" size="sm" variant="ghost" onClick={fetchCeidg} disabled={fetching} title="Pobierz z CEIDG po NIP">
                {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3" /> CEIDG</>}
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto</label>
            <Input {...register('city')} placeholder="Warszawa" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FormSectionContact({
  register, errors,
}: {
  register: ReturnType<typeof useForm<ClientForm>>['register'];
  errors: ReturnType<typeof useForm<ClientForm>>['formState']['errors'];
}) {
  return (
    <div>
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
  );
}

function FormSectionBilling({
  register,
}: {
  register: ReturnType<typeof useForm<ClientForm>>['register'];
}) {
  return (
    <div>
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
  );
}
