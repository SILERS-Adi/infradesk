import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ExternalLink, MapPin, Server as ServerIcon, Ticket as TicketIcon, Users,
  Loader2, AlertCircle, Gauge as GaugeIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { Gauge } from '@/components/ui/Gauge';
import { StatCard } from '@/components/ui/StatCard';
import { cn, formatRelativePl, formatDatePl } from '@/lib/utils';

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

type Tab = 'info' | 'risk' | 'locations' | 'devices' | 'contacts' | 'tickets';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ['clients', id],
    queryFn: async () => (await api.get(`/clients/${id}`)).data,
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--pri)' }} />
    </div>
  );
  if (error || !data) return (
    <Card className="p-10 text-center">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-er" />
      <p className="text-tx font-medium mb-2">Klient nie znaleziony</p>
      <Link to="/clients"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Wróć</Button></Link>
    </Card>
  );

  const c = data.relation.client;

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
      {tab === 'locations' && <LocationsTab data={data} />}
      {tab === 'devices' && <DevicesTab data={data} />}
      {tab === 'contacts' && <ContactsTab data={data} />}
      {tab === 'tickets' && <TicketsTab data={data} />}
    </div>
  );
}

function InfoTab({ data }: { data: ClientDetail }) {
  const c = data.relation.client;
  const r = data.relation;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
  );
}

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

function LocationsTab({ data }: { data: ClientDetail }) {
  if (data.locations.length === 0) return <EmptyState icon={MapPin} text="Brak lokalizacji" />;
  return (
    <Card>
      <div className="divide-y divide-bd">
        {data.locations.map((l) => (
          <div key={l.id} className="px-5 py-3 flex items-center gap-3 hover:bg-sf-h">
            <MapPin className="h-4 w-4 text-tx3" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-tx">{l.name}</p>
              <p className="text-[11px] text-tx3">{l.city ?? '—'}</p>
            </div>
            <Badge variant="neutral">{l.type}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DevicesTab({ data }: { data: ClientDetail }) {
  if (data.devices.length === 0) return <EmptyState icon={ServerIcon} text="Brak urządzeń" />;
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
          <tr>
            <th className="px-4 py-2.5 font-bold">Nazwa</th>
            <th className="px-4 py-2.5 font-bold">Hostname</th>
            <th className="px-4 py-2.5 font-bold">Kategoria</th>
            <th className="px-4 py-2.5 font-bold">Priorytet</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {data.devices.map((d) => (
            <tr key={d.id} className="hover:bg-sf-h">
              <td className="px-4 py-2 text-tx">{d.name}</td>
              <td className="px-4 py-2 text-tx3 font-mono text-[11px]">{d.hostname ?? '—'}</td>
              <td className="px-4 py-2 text-tx2">{d.category}</td>
              <td className="px-4 py-2"><PriorityDot priority={d.criticality} withLabel /></td>
              <td className="px-4 py-2"><Badge variant={d.status === 'ACTIVE' ? 'success' : 'neutral'}>{d.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ContactsTab({ data }: { data: ClientDetail }) {
  if (data.contacts.length === 0) return <EmptyState icon={Users} text="Brak kontaktów" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.contacts.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[13px] font-semibold text-tx">{c.firstName} {c.lastName}</p>
              {c.position && <p className="text-[11px] text-tx3">{c.position}</p>}
            </div>
            {c.isMainContact && <Badge variant="accent">Główny</Badge>}
          </div>
          {c.email && <p className="text-[12px] text-tx2">{c.email}</p>}
          {c.phone && <p className="text-[12px] text-tx3">{c.phone}</p>}
        </Card>
      ))}
    </div>
  );
}

function TicketsTab({ data }: { data: ClientDetail }) {
  if (data.recentTickets.length === 0) return <EmptyState icon={TicketIcon} text="Brak zgłoszeń" />;
  return (
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
  );
}

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
