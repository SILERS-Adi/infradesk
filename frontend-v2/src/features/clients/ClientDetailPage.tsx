import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, ExternalLink, MapPin, Server as ServerIcon, Ticket as TicketIcon, Users,
  Loader2, AlertCircle, Gauge as GaugeIcon, Plus, Pencil, Trash2, X, UserCog, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { Gauge } from '@/components/ui/Gauge';
import { StatCard } from '@/components/ui/StatCard';
import { cn, formatRelativePl, formatDatePl } from '@/lib/utils';
import { CreateLocationModal } from '@/features/locations/LocationsPage';
import { CreateDeviceModal } from '@/features/devices/DevicesPage';
import { CreateContactModal } from '@/features/contacts/ContactsPage';
import { MemberForm } from '@/features/users/MemberForm';

interface ClientDetail {
  relation: {
    id: string;
    status: string;
    billingType: string;
    hourlyRateNet: string | null;
    monthlyNet: string | null;
    client: {
      id: string;
      slug: string;
      name: string;
      taxId: string | null;
      regon: string | null;
      plan: string;
      addressLine1: string | null;
      postalCode: string | null;
      city: string | null;
      country: string;
      email: string | null;
      phone: string | null;
      website: string | null;
      logoUrl: string | null;
      primaryColor: string | null;
      createdAt: string;
      _count: { locations: number; devices: number; tickets: number; memberships: number };
    };
  };
  risk: {
    id: string;
    score: number;
    trend7d: number;
    components: Record<string, number>;
    factors: string[];
    computedAt: string;
  } | null;
  recentTickets: Array<{
    id: string; ticketNumber: string; title: string; status: string; priority: string; createdAt: string;
  }>;
  locations: Array<{ id: string; name: string; city: string | null; type: string }>;
  devices: Array<{ id: string; name: string; category: string; status: string; criticality: string; hostname: string | null }>;
  contacts: Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null; position: string | null; isMainContact: boolean }>;
}

interface Membership {
  id: string;
  role: string;
  scope: string;
  status: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
  };
}

type Tab = 'info' | 'risk' | 'locations' | 'devices' | 'contacts' | 'members' | 'tickets';

// Full Location shape (for edit modal pre-fill)
interface LocationFull {
  id: string;
  name: string;
  type: 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'HOME_OFFICE' | 'OTHER';
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  country: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  geofenceRadiusMeters: number;
  autoCheckInEnabled: boolean;
  requireQrConfirmation: boolean;
}

interface DeviceFull {
  id: string;
  name: string;
  locationId: string;
  hostname: string | null;
  category: string;
  criticality: string;
  status: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  operatingSystem: string | null;
}

interface ContactFull {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  position: string | null;
  clientWorkspaceId: string | null;
  isMainContact: boolean;
  tags: string[];
  notes: string | null;
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ['client-detail', id],
    queryFn: async () => (await api.get(`/clients/${id}`)).data,
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--pri)' }} />
    </div>
  );
  if (error || !data || !id) return (
    <Card className="p-10 text-center">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-er" />
      <p className="text-tx font-medium mb-2">Klient nie znaleziony</p>
      <Link to="/clients"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Wróć</Button></Link>
    </Card>
  );

  const c = data.relation.client;
  // NOTE: URL param `id` IS the clientWorkspaceId (see backend clients.routes.ts /:id).
  const clientWorkspaceId = id;

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Link to="/clients" className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div
            className="w-14 h-14 rounded-[var(--r)] flex items-center justify-center shrink-0 text-[18px] font-bold text-white"
            style={{ background: c.primaryColor ? `linear-gradient(135deg, ${c.primaryColor}, ${c.primaryColor}cc)` : 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
          >
            {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-full h-full object-contain rounded-[var(--r)]" /> : c.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-bold text-tx">{c.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <a
                href={`https://${c.slug}.infradesk.pl`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-mono text-pri hover:underline flex items-center gap-1"
              >
                {c.slug}.infradesk.pl <ExternalLink className="h-3 w-3" />
              </a>
              <Badge variant="neutral">{c.plan}</Badge>
              {data.relation.status !== 'ACTIVE' && <Badge variant="warning">{data.relation.status}</Badge>}
              {data.risk && (
                <Badge variant={data.risk.score <= 30 ? 'success' : data.risk.score <= 65 ? 'warning' : 'danger'}>
                  Risk {data.risk.score}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stg">
        <StatCard icon={MapPin} label="Lokalizacje" value={c._count.locations} accent="primary" />
        <StatCard icon={ServerIcon} label="Urządzenia" value={c._count.devices} accent="neutral" />
        <StatCard icon={TicketIcon} label="Zgłoszenia" value={c._count.tickets} accent="warning" />
        <StatCard icon={Users} label="Pracownicy" value={c._count.memberships} accent="success" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-bd overflow-x-auto">
        {([
          { id: 'info', label: 'Info' },
          { id: 'risk', label: 'Risk Score' },
          { id: 'locations', label: `Lokalizacje (${data.locations.length})` },
          { id: 'devices', label: `Urządzenia (${data.devices.length})` },
          { id: 'contacts', label: `Kontakty (${data.contacts.length})` },
          { id: 'members', label: `Użytkownicy (${c._count.memberships})` },
          { id: 'tickets', label: `Ostatnie zgłoszenia (${data.recentTickets.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={cn(
              'px-3 py-2 text-[12px] font-semibold transition-colors border-b-2 whitespace-nowrap',
              tab === t.id ? 'text-tx' : 'text-tx3 hover:text-tx2',
            )}
            style={tab === t.id ? { borderColor: 'var(--pri)' } : { borderColor: 'transparent' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab data={data} />}
      {tab === 'risk' && <RiskTab data={data} />}
      {tab === 'locations' && <LocationsTab data={data} clientWorkspaceId={clientWorkspaceId} />}
      {tab === 'devices' && <DevicesTab data={data} clientWorkspaceId={clientWorkspaceId} />}
      {tab === 'contacts' && <ContactsTab data={data} clientWorkspaceId={clientWorkspaceId} />}
      {tab === 'members' && <MembersTab clientWorkspaceId={clientWorkspaceId} />}
      {tab === 'tickets' && <TicketsTab data={data} clientWorkspaceId={clientWorkspaceId} />}
    </div>
  );
}

/* ─── INFO TAB (edytowalny) ─── */

function InfoTab({ data }: { data: ClientDetail }) {
  const [editing, setEditing] = useState(false);
  const c = data.relation.client;
  const r = data.relation;
  return (
    <>
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Edytuj firmę
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
        <Card>
          <CardHeader><CardTitle>Dane firmy</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Row label="NIP" value={c.taxId} />
            <Row label="REGON" value={c.regon} />
            <Row label="Adres" value={[c.addressLine1, c.postalCode, c.city, c.country].filter(Boolean).join(', ') || null} />
            <Row label="Email" value={c.email} />
            <Row label="Telefon" value={c.phone} />
            <Row label="Strona" value={c.website} linkify />
            <Row label="Od kiedy" value={formatDatePl(c.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Rozliczenia</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <Row label="Model" value={r.billingType === 'HOURLY' ? 'Godzinowy' : r.billingType === 'SUBSCRIPTION' ? 'Abonament' : 'Hybryda'} />
            <Row label="Stawka godz. netto" value={r.hourlyRateNet ? `${r.hourlyRateNet} PLN` : null} />
            <Row label="Miesięcznie netto" value={r.monthlyNet ? `${r.monthlyNet} PLN` : null} />
            <Row label="Status relacji" value={r.status} />
          </CardContent>
        </Card>
      </div>

      {editing && <EditClientInline data={data} onClose={() => setEditing(false)} />}
    </>
  );
}

/**
 * Inline Edit Client modal — self-contained (we avoid importing the one from ClientsPage
 * to not couple types; keeps form compact: name/taxId/city/phone/website/billing).
 */
function EditClientInline({ data, onClose }: { data: ClientDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const c = data.relation.client;
  const r = data.relation;
  const [form, setForm] = useState({
    name: c.name,
    taxId: c.taxId ?? '',
    city: c.city ?? '',
    addressLine1: c.addressLine1 ?? '',
    postalCode: c.postalCode ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    website: c.website ?? '',
    billingType: r.billingType as 'HOURLY' | 'SUBSCRIPTION' | 'HYBRID',
    hourlyRateNet: r.hourlyRateNet ?? '',
    monthlyNet: r.monthlyNet ?? '',
    status: r.status as 'ACTIVE' | 'SUSPENDED' | 'TERMINATED',
  });

  const mut = useMutation({
    mutationFn: async () => (await api.patch(`/clients/${c.id}`, {
      status: form.status,
      billingType: form.billingType,
      hourlyRateNet: form.hourlyRateNet === '' ? null : Number(form.hourlyRateNet),
      monthlyNet: form.monthlyNet === '' ? null : Number(form.monthlyNet),
      company: {
        name: form.name,
        taxId: form.taxId || null,
        city: form.city || null,
        addressLine1: form.addressLine1 || null,
        postalCode: form.postalCode || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
      },
    })).data,
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['client-detail', c.id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
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
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edytuj firmę — {c.name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">NIP</label>
                <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto</label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Adres</label>
                <Input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Kod pocztowy</label>
                <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Telefon</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Strona www</label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-bd pt-4">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
                <Select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value as typeof form.billingType })}>
                  <option value="HOURLY">Godzinowy</option>
                  <option value="SUBSCRIPTION">Abonament</option>
                  <option value="HYBRID">Hybryda</option>
                </Select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">PLN/h</label>
                <Input type="number" step="0.01" value={form.hourlyRateNet} onChange={(e) => setForm({ ...form, hourlyRateNet: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">PLN/mies.</label>
                <Input type="number" step="0.01" value={form.monthlyNet} onChange={(e) => setForm({ ...form, monthlyNet: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Status relacji</label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                <option value="ACTIVE">Aktywny</option>
                <option value="SUSPENDED">Zawieszony</option>
                <option value="TERMINATED">Zakończony</option>
              </Select>
            </div>
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="button" onClick={() => mut.mutate()} disabled={mut.isPending || form.name.length < 2}>
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz zmiany'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─── RISK TAB (niezmieniony) ─── */

function RiskTab({ data }: { data: ClientDetail }) {
  if (!data.risk) {
    return (
      <Card className="p-10 text-center">
        <GaugeIcon className="h-10 w-10 mx-auto mb-3 text-tx3" />
        <p className="text-tx font-medium mb-2">Risk Score jeszcze nie policzony</p>
        <p className="text-[13px] text-tx3">Iris obliczy go w najbliższej kalkulacji (codziennie o 2:00).</p>
      </Card>
    );
  }
  const r = data.risk;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="p-6 lg:col-span-1 flex flex-col items-center">
        <Gauge pct={r.score} size={200} label="Risk Score" thresholds={{ ok: 30, wn: 65, er: 80 }} />
        {r.trend7d !== 0 && (
          <p className={cn('text-[12px] mt-3 font-semibold', r.trend7d > 0 ? 'text-er' : 'text-ok')}>
            {r.trend7d > 0 ? '↑' : '↓'} {Math.abs(r.trend7d)} pkt / 7 dni
          </p>
        )}
        <p className="text-[10px] text-tx3 mt-1">Obliczony {formatRelativePl(r.computedAt)}</p>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Dlaczego ten score?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">Komponenty</h4>
            <div className="space-y-2">
              {Object.entries(r.components).map(([key, val]) => {
                const labels: Record<string, string> = {
                  payment: 'Opóźnienia płatności',
                  tickets: 'Skoki zgłoszeń',
                  sla: 'Naruszenia SLA',
                  churn: 'Sygnały churn',
                  devices: 'Urządzenia krytyczne bez agenta',
                };
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[12px] text-tx2 w-48 shrink-0">{labels[key] ?? key}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--sf-h)' }}>
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${Math.min(100, (Number(val) / 25) * 100)}%`,
                          background: Number(val) > 15 ? 'var(--er)' : Number(val) > 5 ? 'var(--wn)' : 'var(--ok)',
                        }}
                      />
                    </div>
                    <span className="text-[12px] font-bold tabular-nums w-8 text-right" style={{ color: Number(val) > 15 ? 'var(--er)' : 'var(--tx2)' }}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">Czynniki</h4>
            <ul className="space-y-1.5 text-[12px] text-tx">
              {r.factors.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-tx3 mt-0.5">•</span> <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── LOCATIONS TAB ─── */

function LocationsTab({ data, clientWorkspaceId }: { data: ClientDetail; clientWorkspaceId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const delMut = useMutation({
    mutationFn: async (locId: string) => (await api.delete(`/locations/${locId}`)).data,
    onSuccess: () => {
      toast.success('Usunięto');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  const onMutated = () => {
    qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    qc.invalidateQueries({ queryKey: ['locations'] });
  };

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Dodaj lokalizację
        </Button>
      </div>
      {data.locations.length === 0 ? (
        <EmptyState icon={MapPin} text="Brak lokalizacji" />
      ) : (
        <Card>
          <div className="divide-y divide-bd">
            {data.locations.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3 hover:bg-sf-h group">
                <MapPin className="h-4 w-4 text-tx3" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-tx">{l.name}</p>
                  <p className="text-[11px] text-tx3">{l.city ?? '—'}</p>
                </div>
                <Badge variant="neutral">{l.type}</Badge>
                <button
                  type="button"
                  onClick={() => setEditId(l.id)}
                  className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Edytuj"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Usunąć lokalizację "${l.name}"?`)) delMut.mutate(l.id); }}
                  className="p-1.5 rounded hover:bg-er-l text-tx3 hover:text-er opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Usuń"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showCreate && (
        <CreateLocationModal
          workspaceIdOverride={clientWorkspaceId}
          onClose={() => { setShowCreate(false); onMutated(); }}
        />
      )}
      {editId && (
        <EditLocationModal
          locationId={editId}
          clientWorkspaceId={clientWorkspaceId}
          onClose={() => { setEditId(null); onMutated(); }}
        />
      )}
    </>
  );
}

function EditLocationModal({
  locationId, clientWorkspaceId, onClose,
}: { locationId: string; clientWorkspaceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ location: LocationFull }>({
    queryKey: ['location', locationId],
    queryFn: async () => (await api.get(`/locations/${locationId}`)).data,
  });

  const schema = z.object({
    name: z.string().min(1, 'Nazwa wymagana').max(120),
    type: z.enum(['OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER']).default('OFFICE'),
    addressLine1: z.string().min(1),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional().or(z.literal('')),
  });
  type F = z.infer<typeof schema>;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema),
  });

  // Pre-fill once loaded
  if (data?.location && !isLoading) {
    // Run inside render is OK because react-hook-form's `reset` doesn't trigger re-render unless values changed.
    // But to be safe, wrap in effect pattern: use useState guard.
  }

  const loc = data?.location;

  const mut = useMutation({
    mutationFn: async (f: F) => {
      const payload: Record<string, unknown> = { ...f };
      if (!f.contactEmail) delete payload.contactEmail;
      return (await api.patch(`/locations/${locationId}`, payload)).data;
    },
    onSuccess: () => {
      toast.success('Zaktualizowano');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['location', locationId] });
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
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Edytuj lokalizację</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          {isLoading || !loc ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-tx3" />
            </div>
          ) : (
            <PreloadForm
              defaults={{
                name: loc.name,
                type: loc.type,
                addressLine1: loc.addressLine1,
                postalCode: loc.postalCode,
                city: loc.city,
                contactName: loc.contactName ?? '',
                contactPhone: loc.contactPhone ?? '',
                contactEmail: loc.contactEmail ?? '',
              }}
              reset={reset}
            >
              <form className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((f) => mut.mutate(f))}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                    <Input {...register('name')} />
                    {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Typ</label>
                    <Select {...register('type')}>
                      <option value="OFFICE">Biuro</option>
                      <option value="WAREHOUSE">Magazyn</option>
                      <option value="RETAIL">Sklep</option>
                      <option value="HOME_OFFICE">Home office</option>
                      <option value="OTHER">Inne</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Adres *</label>
                  <Input {...register('addressLine1')} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Kod *</label>
                    <Input {...register('postalCode')} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Miasto *</label>
                    <Input {...register('city')} />
                  </div>
                </div>
                <div className="border-t border-bd pt-4 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">Kontakt na miejscu</h3>
                  <Input {...register('contactName')} placeholder="Imię i nazwisko" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input {...register('contactPhone')} placeholder="Telefon" />
                    <Input type="email" {...register('contactEmail')} placeholder="Email" />
                  </div>
                </div>
              </form>
              <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
                <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                <Button type="button" onClick={handleSubmit((f) => mut.mutate(f))} disabled={isSubmitting || mut.isPending}>
                  {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz'}
                </Button>
              </div>
            </PreloadForm>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* Tiny helper that calls `reset(defaults)` once when mounted. */
function PreloadForm<T extends Record<string, unknown>>({
  defaults, reset, children,
}: { defaults: T; reset: (v: T) => void; children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    reset(defaults);
    setLoaded(true);
  }
  return <>{children}</>;
}

/* ─── DEVICES TAB ─── */

function DevicesTab({ data, clientWorkspaceId }: { data: ClientDetail; clientWorkspaceId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: locs } = useQuery<{ locations: Array<{ id: string; name: string; city: string | null }> }>({
    queryKey: ['locations', 'by-client', clientWorkspaceId],
    queryFn: async () => (await api.get(`/locations`, { params: { workspaceId: clientWorkspaceId } })).data,
  });

  const delMut = useMutation({
    mutationFn: async (devId: string) => (await api.delete(`/devices/${devId}`)).data,
    onSuccess: () => {
      toast.success('Wycofano urządzenie');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    },
    onError: () => toast.error('Błąd'),
  });

  const onMutated = () => {
    qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    qc.invalidateQueries({ queryKey: ['devices'] });
  };

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={(locs?.locations ?? []).length === 0}>
          <Plus className="h-4 w-4" /> Dodaj urządzenie
        </Button>
      </div>
      {(locs?.locations ?? []).length === 0 && (
        <p className="text-[11px] text-tx3 text-right mb-2">Dodaj najpierw lokalizację, zanim dodasz urządzenie.</p>
      )}
      {data.devices.length === 0 ? (
        <EmptyState icon={ServerIcon} text="Brak urządzeń" />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-[13px]">
            <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              <tr>
                <th className="px-4 py-2.5 font-bold">Nazwa</th>
                <th className="px-4 py-2.5 font-bold">Hostname</th>
                <th className="px-4 py-2.5 font-bold">Kategoria</th>
                <th className="px-4 py-2.5 font-bold">Priorytet</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {data.devices.map((d) => (
                <tr key={d.id} className="hover:bg-sf-h group">
                  <td className="px-4 py-2 text-tx">{d.name}</td>
                  <td className="px-4 py-2 text-tx3 font-mono text-[11px]">{d.hostname ?? '—'}</td>
                  <td className="px-4 py-2 text-tx2">{d.category}</td>
                  <td className="px-4 py-2"><PriorityDot priority={d.criticality} withLabel /></td>
                  <td className="px-4 py-2"><Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1 opacity-60 group-hover:opacity-100">
                      <button type="button" onClick={() => setEditId(d.id)} className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri" title="Edytuj">
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Wycofać urządzenie "${d.name}"?`)) delMut.mutate(d.id); }}
                        className="p-1.5 rounded hover:bg-er-l text-tx3 hover:text-er"
                        title="Wycofaj"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showCreate && (
        <CreateDeviceModal
          workspaceIdOverride={clientWorkspaceId}
          locations={locs?.locations.map((l) => ({ ...l, addressLine1: '', postalCode: '', country: 'PL', type: 'OFFICE' as const })) ?? []}
          onClose={() => { setShowCreate(false); onMutated(); }}
        />
      )}
      {editId && (
        <EditDeviceModal
          deviceId={editId}
          clientWorkspaceId={clientWorkspaceId}
          locations={locs?.locations ?? []}
          onClose={() => { setEditId(null); onMutated(); }}
        />
      )}
    </>
  );
}

function EditDeviceModal({
  deviceId, clientWorkspaceId, locations, onClose,
}: {
  deviceId: string;
  clientWorkspaceId: string;
  locations: Array<{ id: string; name: string; city: string | null }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ device: DeviceFull }>({
    queryKey: ['device', deviceId],
    queryFn: async () => (await api.get(`/devices/${deviceId}`)).data,
  });

  const schema = z.object({
    name: z.string().min(1),
    locationId: z.string().uuid(),
    hostname: z.string().optional(),
    category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']),
    criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    status: z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    ipAddress: z.string().optional(),
    macAddress: z.string().optional(),
    operatingSystem: z.string().optional(),
  });
  type F = z.infer<typeof schema>;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema),
  });

  const d = data?.device;
  const mut = useMutation({
    mutationFn: async (f: F) => (await api.patch(`/devices/${deviceId}`, f)).data,
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
      qc.invalidateQueries({ queryKey: ['device', deviceId] });
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
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Edytuj urządzenie</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          {isLoading || !d ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-tx3" />
            </div>
          ) : (
            <PreloadForm
              defaults={{
                name: d.name,
                locationId: d.locationId,
                hostname: d.hostname ?? '',
                category: d.category as F['category'],
                criticality: d.criticality as F['criticality'],
                status: d.status as F['status'],
                manufacturer: d.manufacturer ?? '',
                model: d.model ?? '',
                serialNumber: d.serialNumber ?? '',
                ipAddress: d.ipAddress ?? '',
                macAddress: d.macAddress ?? '',
                operatingSystem: d.operatingSystem ?? '',
              }}
              reset={reset}
            >
              <form className="px-6 py-5 space-y-3 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((f) => mut.mutate(f))}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
                    <Input {...register('name')} />
                    {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Hostname</label>
                    <Input {...register('hostname')} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Lokalizacja *</label>
                  <Select {...register('locationId')}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name} {l.city && `(${l.city})`}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
                    <Select {...register('category')}>
                      {['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Priorytet</label>
                    <Select {...register('criticality')}>
                      <option value="LOW">Niski</option>
                      <option value="MEDIUM">Średni</option>
                      <option value="HIGH">Wysoki</option>
                      <option value="CRITICAL">Krytyczny</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Status</label>
                    <Select {...register('status')}>
                      <option value="ACTIVE">Aktywny</option>
                      <option value="INACTIVE">Nieaktywny</option>
                      <option value="DECOMMISSIONED">Wycofany</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Producent</label>
                    <Input {...register('manufacturer')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
                    <Input {...register('model')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Serial</label>
                    <Input {...register('serialNumber')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">IP</label>
                    <Input {...register('ipAddress')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">MAC</label>
                    <Input {...register('macAddress')} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">System</label>
                  <Input {...register('operatingSystem')} />
                </div>
              </form>
              <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
                <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                <Button type="button" onClick={handleSubmit((f) => mut.mutate(f))} disabled={isSubmitting || mut.isPending}>
                  {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz'}
                </Button>
              </div>
            </PreloadForm>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─── CONTACTS TAB ─── */

function ContactsTab({ data, clientWorkspaceId }: { data: ClientDetail; clientWorkspaceId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: clientsList } = useQuery<{ clients: Array<{ client: { id: string; name: string; slug: string } }> }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
  });

  const delMut = useMutation({
    mutationFn: async (cid: string) => (await api.delete(`/contacts/${cid}`)).data,
    onSuccess: () => {
      toast.success('Usunięto');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    },
    onError: () => toast.error('Błąd'),
  });

  const onMutated = () => {
    qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    qc.invalidateQueries({ queryKey: ['contacts'] });
  };

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Dodaj kontakt
        </Button>
      </div>
      {data.contacts.length === 0 ? (
        <EmptyState icon={Users} text="Brak kontaktów" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.contacts.map((c) => (
            <Card key={c.id} className="p-4 relative group">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[13px] font-semibold text-tx">{c.firstName} {c.lastName}</p>
                  {c.position && <p className="text-[11px] text-tx3">{c.position}</p>}
                </div>
                {c.isMainContact && <Badge variant="accent">Główny</Badge>}
              </div>
              {c.email && <p className="text-[12px] text-tx2">{c.email}</p>}
              {c.phone && <p className="text-[12px] text-tx3">{c.phone}</p>}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                <button type="button" onClick={() => setEditId(c.id)} className="p-1.5 rounded bg-sf border border-bd hover:border-pri text-tx3 hover:text-pri" title="Edytuj">
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Usunąć ${c.firstName} ${c.lastName}?`)) delMut.mutate(c.id); }}
                  className="p-1.5 rounded bg-sf border border-bd hover:border-er text-tx3 hover:text-er"
                  title="Usuń"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateContactModal
          clients={clientsList?.clients ?? []}
          clientWorkspaceIdPrefill={clientWorkspaceId}
          onClose={() => { setShowCreate(false); onMutated(); }}
        />
      )}
      {editId && (
        <EditContactModal
          contactId={editId}
          clientWorkspaceId={clientWorkspaceId}
          onClose={() => { setEditId(null); onMutated(); }}
        />
      )}
    </>
  );
}

function EditContactModal({
  contactId, clientWorkspaceId, onClose,
}: { contactId: string; clientWorkspaceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ contact: ContactFull }>({
    queryKey: ['contact', contactId],
    queryFn: async () => (await api.get(`/contacts/${contactId}`)).data,
  });

  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    position: z.string().optional(),
    isMainContact: z.boolean().default(false),
  });
  type F = z.infer<typeof schema>;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema),
  });

  const c = data?.contact;

  const mut = useMutation({
    mutationFn: async (f: F) => {
      const payload: Record<string, unknown> = { ...f, clientWorkspaceId };
      if (!f.email) delete payload.email;
      return (await api.patch(`/contacts/${contactId}`, payload)).data;
    },
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      onClose();
    },
    onError: () => toast.error('Błąd'),
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">Edytuj kontakt</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          {isLoading || !c ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-tx3" />
            </div>
          ) : (
            <PreloadForm
              defaults={{
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email ?? '',
                phone: c.phone ?? '',
                position: c.position ?? '',
                isMainContact: c.isMainContact,
              }}
              reset={reset}
            >
              <form className="px-6 py-5 space-y-3" onSubmit={handleSubmit((f) => mut.mutate(f))}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Imię *</label>
                    <Input {...register('firstName')} />
                    {errors.firstName && <p className="text-[11px] text-er mt-1">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwisko *</label>
                    <Input {...register('lastName')} />
                    {errors.lastName && <p className="text-[11px] text-er mt-1">{errors.lastName.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Stanowisko</label>
                  <Input {...register('position')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Email</label>
                    <Input type="email" {...register('email')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-tx3 mb-1">Telefon</label>
                    <Input {...register('phone')} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
                  <input type="checkbox" {...register('isMainContact')} className="accent-[color:var(--pri)]" />
                  Główny kontakt firmy
                </label>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
                  <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
                  <Button type="submit" disabled={isSubmitting || mut.isPending}>
                    {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz'}
                  </Button>
                </div>
              </form>
            </PreloadForm>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─── MEMBERS TAB (nowy) ─── */

function MembersTab({ clientWorkspaceId }: { clientWorkspaceId: string }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ memberships: Membership[] }>({
    queryKey: ['memberships', 'by-client', clientWorkspaceId],
    queryFn: async () => (await api.get(`/memberships`, { params: { workspaceId: clientWorkspaceId } })).data,
  });

  const delMut = useMutation({
    mutationFn: async (mid: string) => (await api.delete(`/memberships/${mid}`)).data,
    onSuccess: () => {
      toast.success('Członkostwo odwołane');
      qc.invalidateQueries({ queryKey: ['memberships', 'by-client', clientWorkspaceId] });
      qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  const onMutated = () => {
    qc.invalidateQueries({ queryKey: ['memberships', 'by-client', clientWorkspaceId] });
    qc.invalidateQueries({ queryKey: ['client-detail', clientWorkspaceId] });
  };

  const members = data?.memberships ?? [];

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" /> Zaproś członka
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-tx3" />
        </div>
      ) : members.length === 0 ? (
        <EmptyState icon={UserCog} text="Brak użytkowników — zaproś pierwszego pracownika firmy" />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-[13px]">
            <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              <tr>
                <th className="px-4 py-2.5 font-bold">Osoba</th>
                <th className="px-4 py-2.5 font-bold">Email</th>
                <th className="px-4 py-2.5 font-bold">Rola</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Ostatnio</th>
                <th className="px-4 py-2.5 font-bold w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-sf-h group">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}>
                        {m.user.avatarUrl
                          ? <img src={m.user.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                          : `${m.user.firstName?.[0] ?? ''}${m.user.lastName?.[0] ?? ''}`}
                      </div>
                      <span className="text-tx font-medium">{m.user.firstName} {m.user.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-tx3 text-[12px]"><Mail className="inline h-3 w-3 mr-1" />{m.user.email}</td>
                  <td className="px-4 py-2"><Badge variant={m.role === 'OWNER' ? 'accent' : m.role === 'ADMIN' ? 'warning' : 'neutral'}>{m.role}</Badge></td>
                  <td className="px-4 py-2">
                    <Badge variant={m.status === 'ACTIVE' ? 'success' : m.status === 'INVITED' ? 'warning' : 'danger'}>{m.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-tx3 text-[11px]">{m.user.lastLoginAt ? formatRelativePl(m.user.lastLoginAt) : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1 opacity-60 group-hover:opacity-100">
                      <button type="button" onClick={() => setEditMemberId(m.id)} className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri" title="Edytuj">
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Odwołać dostęp dla ${m.user.firstName} ${m.user.lastName}?`)) delMut.mutate(m.id); }}
                        className="p-1.5 rounded hover:bg-er-l text-tx3 hover:text-er"
                        title="Odwołaj"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {inviteOpen && (
        <MemberForm
          workspaceIdOverride={clientWorkspaceId}
          onClose={() => { setInviteOpen(false); onMutated(); }}
        />
      )}
      {editMemberId && (
        <MemberForm
          membershipId={editMemberId}
          workspaceIdOverride={clientWorkspaceId}
          onClose={() => { setEditMemberId(null); onMutated(); }}
        />
      )}
    </>
  );
}

/* ─── TICKETS TAB ─── */

function TicketsTab({ data, clientWorkspaceId }: { data: ClientDetail; clientWorkspaceId: string }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => navigate(`/tickets/new?clientWorkspaceId=${clientWorkspaceId}`)}>
          <Plus className="h-4 w-4" /> Nowe zgłoszenie
        </Button>
      </div>
      {data.recentTickets.length === 0 ? (
        <EmptyState icon={TicketIcon} text="Brak zgłoszeń" />
      ) : (
        <Card>
          <div className="divide-y divide-bd">
            {data.recentTickets.map((t) => (
              <Link key={t.id} to={`/tickets/${t.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-sf-h">
                <PriorityDot priority={t.priority} />
                <span className="text-[11px] font-mono text-tx3">{t.ticketNumber}</span>
                <span className="text-[13px] text-tx flex-1 truncate">{t.title}</span>
                <StatusPill entity="ticket" value={t.status} />
                <span className="text-[11px] text-tx3">{formatRelativePl(t.createdAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ─── COMMON ─── */

function EmptyState({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <Card className="p-10 text-center">
      <Icon className="h-10 w-10 mx-auto mb-3 text-tx3" />
      <p className="text-[13px] text-tx3">{text}</p>
    </Card>
  );
}

function Row({ label, value, linkify }: { label: string; value: string | null; linkify?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em] shrink-0">{label}</span>
      <span className="text-right text-[13px] text-tx">
        {value ? (linkify && value.startsWith('http') ? <a href={value} target="_blank" rel="noreferrer" className="hover:underline text-pri">{value}</a> : value) : <span className="text-tx3">—</span>}
      </span>
    </div>
  );
}
