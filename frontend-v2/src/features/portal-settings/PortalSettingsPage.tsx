import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Globe2, ExternalLink, Copy, ShieldCheck, Sparkles, Building, CheckCircle2,
  Search, X, Users, Key as KeyIcon, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { useColumns, type Column } from '@/components/ui/ColumnPicker';
import { cn } from '@/lib/utils';

interface ClientRelation {
  relationId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  billingType: 'HOURLY' | 'SUBSCRIPTION' | 'HYBRID';
  billingPeriod?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | null;
  hourlyRateNet: string | null;
  monthlyNet?: string | null;
  monthlyHours?: number | null;
  canViewDevices?: boolean;
  canViewUsers?: boolean;
  canViewLocations?: boolean;
  canReceiveTickets?: boolean;
  canCreateTicketsOnBehalf?: boolean;
  canAccessAlerts?: boolean;
  canAccessCredentials?: boolean;
  client: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor?: string | null;
    email: string | null;
    plan: string;
    isActive: boolean;
    createdAt?: string;
    _count?: { locations: number; devices: number; tickets: number; memberships: number };
  };
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function copyLink(slug: string) {
  const url = `https://${slug}.infradesk.pl`;
  navigator.clipboard.writeText(url);
  toast.success('Link skopiowany');
}

function permissionsTruthyCount(r: ClientRelation): number {
  const flags = [
    r.canViewDevices, r.canViewUsers, r.canViewLocations,
    r.canReceiveTickets, r.canCreateTicketsOnBehalf,
    r.canAccessAlerts, r.canAccessCredentials,
  ];
  return flags.filter(Boolean).length;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

const PERMISSION_KEYS = [
  { key: 'canViewDevices', short: 'DV', label: 'Urządzenia' },
  { key: 'canViewUsers', short: 'DU', label: 'Użytkownicy' },
  { key: 'canViewLocations', short: 'DL', label: 'Lokalizacje' },
  { key: 'canReceiveTickets', short: 'RT', label: 'Odbiór zgłoszeń' },
  { key: 'canCreateTicketsOnBehalf', short: 'CT', label: 'Tworzenie zgł.' },
  { key: 'canAccessAlerts', short: 'AA', label: 'Alerty' },
  { key: 'canAccessCredentials', short: 'AC', label: 'Hasła' },
] as const;

export function PortalSettingsPage() {
  const [view, setView] = useViewPreference('portal-settings', 'visual');
  const [sp, setSp] = useSearchParams();

  const [searchInput, setSearchInput] = useState(sp.get('q') ?? '');
  const debouncedSearch = useDebounced(searchInput, 300);
  const planFilter = sp.get('plan') ?? '';
  const planList = planFilter ? planFilter.split(',') : [];
  const statusFilter = sp.get('status') ?? '';
  const billingFilter = sp.get('billing') ?? '';

  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (debouncedSearch === cur) return;
    const next = new URLSearchParams(sp);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp);
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  }

  function togglePlan(p: string) {
    const cur = planList.includes(p) ? planList.filter((x) => x !== p) : [...planList, p];
    updateParam('plan', cur.length ? cur.join(',') : null);
  }

  function clearAll() {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  }

  const clientsQ = useQuery<{ clients: ClientRelation[] }>({
    queryKey: ['clients', 'portals'],
    queryFn: async () => (await api.get<{ clients: ClientRelation[] }>('/clients')).data,
  });

  const clients = clientsQ.data?.clients ?? [];
  const activePortals = clients.filter((c) => c.client.isActive);

  const filtered = useMemo(() => {
    let list = clients;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.client.name.toLowerCase().includes(q) ||
        r.client.slug.toLowerCase().includes(q),
      );
    }
    if (planList.length > 0) {
      list = list.filter((r) => planList.includes(r.client.plan));
    }
    if (statusFilter === 'active') list = list.filter((r) => r.client.isActive);
    else if (statusFilter === 'inactive') list = list.filter((r) => !r.client.isActive);
    if (billingFilter) list = list.filter((r) => r.billingType === billingFilter);
    return list;
  }, [clients, debouncedSearch, planList, statusFilter, billingFilter]);

  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (planList.length > 0 ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (billingFilter ? 1 : 0);

  const columns = useMemo<Column<ClientRelation>[]>(() => [
    {
      id: 'logo',
      label: 'Firma',
      pinned: true,
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-[var(--r-s)] flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
            style={{ background: r.client.primaryColor ? `linear-gradient(135deg, ${r.client.primaryColor}, ${r.client.primaryColor}cc)` : 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
          >
            {r.client.logoUrl
              ? <img src={r.client.logoUrl} alt="" className="w-full h-full object-contain rounded-[var(--r-s)]" />
              : r.client.name.slice(0, 2).toUpperCase()}
          </div>
          <Link to={`/clients/${r.client.id}`} className="text-[13px] font-medium text-tx hover:text-pri truncate">
            {r.client.name}
          </Link>
        </div>
      ),
    },
    {
      id: 'slug',
      label: 'Subdomena',
      render: (r) => (
        <a
          href={`https://${r.client.slug}.infradesk.pl`}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[11px] font-mono text-pri hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.client.slug}.infradesk.pl
        </a>
      ),
    },
    {
      id: 'plan',
      label: 'Plan',
      render: (r) => <Badge variant="neutral">{r.client.plan}</Badge>,
    },
    {
      id: 'status',
      label: 'Status',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: r.client.isActive ? 'var(--ok)' : 'var(--er)' }}
          />
          <span className="text-[12px]">{r.client.isActive ? 'Aktywny' : 'Nieaktywny'}</span>
        </div>
      ),
    },
    {
      id: 'portalUrl',
      label: 'Link portalu',
      defaultVisible: false,
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); copyLink(r.client.slug); }}
          className="p-1 rounded hover:bg-sf-h text-tx3 hover:text-tx"
          title={`Kopiuj https://${r.client.slug}.infradesk.pl`}
        >
          <Copy size={13} />
        </button>
      ),
    },
    {
      id: 'billingType',
      label: 'Model rozliczeń',
      defaultVisible: false,
      render: (r) => <span className="text-[11px] text-tx2">{r.billingType}</span>,
    },
    {
      id: 'hourlyRate',
      label: 'Stawka PLN/h',
      defaultVisible: false,
      render: (r) => <span className="text-[11px] text-tx3 tabular-nums">{r.hourlyRateNet ? `${r.hourlyRateNet} PLN/h` : '—'}</span>,
    },
    {
      id: 'monthlyHours',
      label: 'Godziny / mies.',
      defaultVisible: false,
      render: (r) => <span className="text-[11px] text-tx3 tabular-nums">{r.monthlyHours != null ? `${r.monthlyHours} h` : '—'}</span>,
    },
    {
      id: 'createdAt',
      label: 'Utworzono',
      defaultVisible: false,
      render: (r) => <span className="text-[11px] text-tx3 tabular-nums">{formatDate(r.client.createdAt)}</span>,
    },
    {
      id: 'permissions',
      label: 'Uprawnienia',
      defaultVisible: false,
      render: (r) => (
        <div className="flex items-center gap-1 flex-wrap">
          {PERMISSION_KEYS.map((pk) => {
            const on = (r as unknown as Record<string, unknown>)[pk.key] === true;
            return (
              <span
                key={pk.key}
                title={`${pk.label}: ${on ? 'tak' : 'nie'}`}
                className={cn(
                  'text-[9px] font-mono px-1 py-0.5 rounded border tabular-nums',
                  on
                    ? 'bg-ok-l border-ok-b text-ok'
                    : 'bg-sf-h border-bd text-tx3',
                )}
              >
                {pk.short}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      id: 'actions',
      label: 'Akcje',
      pinned: true,
      render: (r) => (
        <div className="flex items-center gap-0.5 justify-end">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); copyLink(r.client.slug); }}
            className="p-1.5 rounded hover:bg-sf-h text-tx3 hover:text-tx"
            title="Kopiuj link"
          >
            <Copy size={13} />
          </button>
          <a
            href={`https://${r.client.slug}.infradesk.pl`}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded hover:bg-sf-h text-tx3 hover:text-tx"
            title="Otwórz portal klienta"
          >
            <ExternalLink size={13} />
          </a>
          <Link
            to={`/clients/${r.client.id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded hover:bg-sf-h text-tx3 hover:text-pri"
            title="Otwórz szczegóły klienta"
          >
            <Pencil size={13} />
          </Link>
        </div>
      ),
    },
  ], []);

  const { visibleColumns, pickerButton } = useColumns<ClientRelation>({
    tableKey: 'portal-settings',
    columns,
  });

  return (
    <div className="space-y-[var(--sp-4)] anim-up">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Globe2 size={18} className="text-[var(--pri)]" /> Portal i obsługa klienta
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Każdy klient ma własną subdomenę <code>slug.infradesk.pl</code> — widzi tylko swoje dane.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <Building size={12} /> Aktywne portale
          </div>
          <div className="text-[28px] font-semibold mt-1 text-[var(--pri)]">{activePortals.length}</div>
        </Card>
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <ShieldCheck size={12} /> Wildcard SSL
          </div>
          <div className="text-[15px] font-semibold mt-1 flex items-center gap-1.5 text-[var(--ok)]">
            <CheckCircle2 size={14} /> Aktywny
          </div>
          <div className="text-[10px] text-[var(--tx3)] mt-1">*.infradesk.pl · Let's Encrypt</div>
        </Card>
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <Sparkles size={12} /> Gotowe funkcje
          </div>
          <div className="text-[15px] font-semibold mt-1">Tickety · Urządzenia · Vault · AI</div>
        </Card>
      </div>

      {/* Filter bar + toolbar */}
      <Card className="p-3">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="text-[12px] text-tx3">
            {filtered.length} {filtered.length === 1 ? 'portal' : 'portali'}
            {activeFilterCount > 0 && <span className="ml-2 text-pri">(filtry: {activeFilterCount})</span>}
          </div>
          <div className="flex items-center gap-2">
            {view === 'table' && pickerButton}
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Szukaj</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tx3 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Szukaj po nazwie / subdomenie"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Status</label>
            <Select value={statusFilter} onChange={(e) => updateParam('status', e.target.value || null)}>
              <option value="">Wszystkie</option>
              <option value="active">Tylko aktywne</option>
              <option value="inactive">Tylko nieaktywne</option>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Model rozliczeń</label>
            <Select value={billingFilter} onChange={(e) => updateParam('billing', e.target.value || null)}>
              <option value="">Wszystkie</option>
              <option value="HOURLY">Godzinowo</option>
              <option value="SUBSCRIPTION">Abonament</option>
              <option value="HYBRID">Hybryda</option>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-tx3">Plan:</span>
            {['STARTER', 'PRO', 'ENTERPRISE'].map((p) => {
              const on = planList.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlan(p)}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded-[var(--r-s)] border transition-colors',
                    on
                      ? 'border-pri bg-pri-l text-pri font-semibold'
                      : 'border-bd bg-sf2 text-tx3 hover:text-tx',
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-3.5 w-3.5" /> Wyczyść filtry
            </Button>
          )}
        </div>
      </Card>

      {/* Body */}
      {clientsQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-3)]">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-[var(--sp-6)] text-center text-[var(--tx3)]">
          <Globe2 size={32} className="mx-auto mb-3 opacity-40" />
          <div className="text-[14px] mb-2">
            {clients.length === 0 ? 'Jeszcze żaden klient nie ma portalu.' : 'Żaden portal nie pasuje do wybranych filtrów.'}
          </div>
          {clients.length === 0 ? (
            <Link to="/clients">
              <Button variant="ghost" className="gap-1.5">Dodaj klienta</Button>
            </Link>
          ) : (
            <Button variant="ghost" className="gap-1.5" onClick={clearAll}>
              Wyczyść filtry
            </Button>
          )}
        </Card>
      ) : view === 'visual' ? (
        <PortalsGrid relations={filtered} />
      ) : (
        <PortalsTable relations={filtered} visibleColumns={visibleColumns} />
      )}

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-2 flex items-center gap-2">
          <Sparkles size={13} className="text-[var(--pri)]" /> Co widzi klient w portalu?
        </h2>
        <ul className="text-[12px] text-[var(--tx2)] space-y-1 list-disc pl-5">
          <li>Kokpit z własnymi metrykami (tylko jego dane — RLS wymusza izolację).</li>
          <li>Swoje zgłoszenia (tworzenie, komentarze, ocena) oraz kalendarz wizyt serwisantów.</li>
          <li>Listę swoich urządzeń z audit score, alertami i historią serwisową.</li>
          <li>Własny sejf haseł (Wszystkie/Moje/Współdzielone — zależnie od roli).</li>
          <li>Iris AI — chat kontekstowy do jego danych.</li>
          <li>Ustawienia konta + 2FA.</li>
        </ul>
        <p className="text-[11px] text-[var(--tx3)] mt-3">
          Klient NIE widzi innych workspace'ów, AI Shadow Mode, kosztów AI, ani listy wszystkich klientów MSP.
        </p>
      </Card>
    </div>
  );
}

function PortalsGrid({ relations }: { relations: ClientRelation[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-3)] stg">
      {relations.map((r) => {
        const c = r.client;
        const permCount = permissionsTruthyCount(r);
        const members = c._count?.memberships ?? 0;
        return (
          <div key={r.relationId} className="relative group">
            <Card className="p-4 h-full">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0 text-[13px] font-bold text-white"
                    style={{ background: c.primaryColor ? `linear-gradient(135deg, ${c.primaryColor}, ${c.primaryColor}cc)` : 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
                  >
                    {c.logoUrl
                      ? <img src={c.logoUrl} alt="" className="w-full h-full object-contain rounded-[var(--r-s)]" />
                      : c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <Link to={`/clients/${c.id}`} className="text-[14px] font-semibold text-tx hover:text-pri truncate block">
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <a
                        href={`https://${c.slug}.infradesk.pl`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] font-mono text-pri hover:underline truncate"
                      >
                        {c.slug}.infradesk.pl
                      </a>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyLink(c.slug); }}
                        className="p-1 rounded hover:bg-sf-h text-tx3 hover:text-tx shrink-0"
                        title="Kopiuj link"
                      >
                        <Copy size={10} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="neutral">{c.plan}</Badge>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: c.isActive ? 'var(--ok)' : 'var(--er)' }}
                    />
                    <span className="text-tx3">{c.isActive ? 'Aktywny' : 'Nieaktywny'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] pt-3 border-t border-bd">
                <Stat icon={KeyIcon} value={`${permCount}/7`} label="Uprawnienia" />
                <Stat icon={Users} value={members} label="Członkowie" />
                <Stat value={r.billingType} label="Rozliczenie" valueClass="text-[10px] uppercase tabular-nums" />
              </div>
            </Card>
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={`https://${c.slug}.infradesk.pl`}
                target="_blank"
                rel="noreferrer noopener"
                className="p-1.5 rounded bg-sf border border-bd hover:border-pri text-tx3 hover:text-pri"
                title="Otwórz portal klienta"
              >
                <ExternalLink size={12} />
              </a>
              <Link
                to={`/clients/${c.id}`}
                className="p-1.5 rounded bg-sf border border-bd hover:border-pri text-tx3 hover:text-pri"
                title="Edytuj firmę"
              >
                <Pencil size={12} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon: Icon, value, label, valueClass }: { icon?: typeof Users; value: string | number; label: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-tx2 min-w-0">
      {Icon && <Icon className="h-3 w-3 text-tx3 shrink-0" />}
      <span className={cn('font-semibold text-tx truncate', valueClass)}>{value}</span>
      <span className="text-tx3 text-[10px] truncate">{label}</span>
    </div>
  );
}

function PortalsTable({ relations, visibleColumns }: { relations: ClientRelation[]; visibleColumns: Column<ClientRelation>[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-sf-h border-b border-bd">
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    'px-4 py-2.5 font-bold',
                    col.id === 'actions' ? 'text-right' : '',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.id === 'actions' ? '' : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {relations.map((r) => (
              <tr key={r.relationId} className="hover:bg-sf-h group">
                {visibleColumns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      'px-4 py-3',
                      col.id === 'actions' ? 'text-right' : '',
                    )}
                  >
                    {col.render ? col.render(r) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
