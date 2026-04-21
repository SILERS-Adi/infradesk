import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText, Filter, RefreshCw, ChevronDown, ChevronRight,
  Ticket, Server, FileText, Key, UserCircle, Briefcase, Database, MapPin, Package,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl, formatDatePl } from '@/lib/utils';

interface ActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  description: string;
  performedByUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  performedBy: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

interface Facets {
  entityTypes: { key: string; count: number }[];
  actionTypes: { key: string; count: number }[];
  actors: {
    id: string;
    user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
    count: number;
  }[];
}

const ENTITY_META: Record<string, { icon: typeof Ticket; label: string; color: string }> = {
  ticket:      { icon: Ticket,     label: 'Ticket',        color: 'var(--pri)' },
  device:      { icon: Server,     label: 'Urządzenie',    color: 'var(--in)' },
  session:     { icon: FileText,   label: 'Sesja',         color: 'var(--ok)' },
  credential:  { icon: Key,        label: 'Hasło',         color: 'var(--er)' },
  user:        { icon: UserCircle, label: 'Użytkownik',    color: 'var(--tx2)' },
  client:      { icon: Briefcase,  label: 'Klient',        color: 'var(--pri)' },
  backup:      { icon: Database,   label: 'Backup',        color: 'var(--wn)' },
  location:    { icon: MapPin,     label: 'Lokalizacja',   color: 'var(--in)' },
  order:       { icon: Package,    label: 'Zamówienie',    color: 'var(--tx2)' },
};

type BadgeVariant = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info';

const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  created:            { label: 'utworzył',       variant: 'success' },
  updated:            { label: 'zaktualizował',  variant: 'info' },
  deleted:            { label: 'usunął',         variant: 'danger' },
  assigned:           { label: 'przypisał',      variant: 'info' },
  status_changed:     { label: 'zmienił status', variant: 'info' },
  commented:          { label: 'skomentował',    variant: 'neutral' },
  revealed_credential:{ label: 'odsłonił hasło', variant: 'warning' },
  run_now:            { label: 'uruchomił',      variant: 'info' },
  session_started:    { label: 'rozpoczął sesję',variant: 'success' },
  session_ended:      { label: 'zakończył sesję',variant: 'info' },
  approved:           { label: 'zatwierdził',    variant: 'success' },
  rejected:           { label: 'odrzucił',       variant: 'danger' },
  login:              { label: 'zalogował się',  variant: 'info' },
  logout:             { label: 'wylogował się',  variant: 'neutral' },
};

function renderActor(log: ActivityLog) {
  if (!log.performedBy) return <span className="text-[var(--tx3)]">System</span>;
  const name = [log.performedBy.firstName, log.performedBy.lastName].filter(Boolean).join(' ') || log.performedBy.email;
  return <span>{name}</span>;
}

function entityMeta(type: string) {
  return ENTITY_META[type] ?? { icon: ScrollText, label: type, color: 'var(--tx3)' };
}
function actionMeta(type: string) {
  return ACTION_META[type] ?? { label: type, variant: 'neutral' as BadgeVariant };
}

export function ActivityLogsPage() {
  const [entityType, setEntityType] = useState('');
  const [actionType, setActionType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facetsQ = useQuery<Facets>({
    queryKey: ['activity-logs', 'facets'],
    queryFn: async () => (await api.get<Facets>('/activity-logs/facets')).data,
    staleTime: 5 * 60_000,
  });

  const queryKey = ['activity-logs', { entityType, actionType, actorId, from, to }];
  const listQ = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (actionType) params.set('actionType', actionType);
      if (actorId) params.set('performedByUserId', actorId);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      params.set('limit', '100');
      const res = await api.get<{ items: ActivityLog[]; nextCursor: string | null }>(
        `/activity-logs?${params.toString()}`,
      );
      return res.data;
    },
  });

  const logs = listQ.data?.items ?? [];

  const grouped = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    for (const log of logs) {
      const day = log.createdAt.slice(0, 10);
      (groups[day] ??= []).push(log);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [logs]);

  const activeFilters = [entityType, actionType, actorId, from, to].filter(Boolean).length;

  function clearFilters() {
    setEntityType('');
    setActionType('');
    setActorId('');
    setFrom('');
    setTo('');
  }

  return (
    <div className="space-y-[var(--sp-4)]">
      <div className="flex items-center justify-between gap-[var(--sp-3)]">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Logi aktywności</h1>
          <p className="text-[13px] text-[var(--tx3)] mt-0.5">
            Pełny audyt — każda istotna akcja w workspace z IP i agentem przeglądarki.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            className="gap-1.5"
          >
            <Filter size={14} />
            Filtry
            {activeFilters > 0 && (
              <Badge variant="info">{activeFilters}</Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => listQ.refetch()}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={listQ.isFetching ? 'animate-spin' : ''} />
            Odśwież
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <Card className="p-[var(--sp-4)] space-y-[var(--sp-3)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
            <div>
              <label className="text-[12px] text-[var(--tx3)] block mb-1">Typ obiektu</label>
              <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                <option value="">Wszystkie</option>
                {facetsQ.data?.entityTypes.map((e) => (
                  <option key={e.key} value={e.key}>
                    {entityMeta(e.key).label} ({e.count})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-[12px] text-[var(--tx3)] block mb-1">Akcja</label>
              <Select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                <option value="">Wszystkie</option>
                {facetsQ.data?.actionTypes.map((a) => (
                  <option key={a.key} value={a.key}>
                    {actionMeta(a.key).label} ({a.count})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-[12px] text-[var(--tx3)] block mb-1">Użytkownik</label>
              <Select value={actorId} onChange={(e) => setActorId(e.target.value)}>
                <option value="">Wszyscy</option>
                {facetsQ.data?.actors.map((a) => {
                  const name = a.user
                    ? [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || a.user.email
                    : a.id.slice(0, 8);
                  return (
                    <option key={a.id} value={a.id}>
                      {name} ({a.count})
                    </option>
                  );
                })}
              </Select>
            </div>
            <div>
              <label className="text-[12px] text-[var(--tx3)] block mb-1">Od</label>
              <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-[12px] text-[var(--tx3)] block mb-1">Do</label>
              <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!activeFilters}>
                Wyczyść filtry
              </Button>
            </div>
          </div>
        </Card>
      )}

      {listQ.isLoading ? (
        <div className="space-y-[var(--sp-3)]">
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-[var(--sp-6)] text-center text-[var(--tx3)]">
          <ScrollText size={32} className="mx-auto mb-3 opacity-40" />
          <div className="text-[14px]">Brak wpisów pasujących do filtrów.</div>
        </Card>
      ) : (
        <div className="space-y-[var(--sp-4)]">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-[11px] uppercase tracking-wider text-[var(--tx3)] mb-2 px-1">
                {formatDatePl(new Date(day))} · {items.length} {items.length === 1 ? 'wpis' : 'wpisów'}
              </div>
              <Card className="divide-y divide-[var(--bd)]">
                {items.map((log) => {
                  const em = entityMeta(log.entityType);
                  const am = actionMeta(log.actionType);
                  const EntityIcon = em.icon;
                  const expanded = expandedId === log.id;
                  const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;
                  const hasAux = log.ipAddress || log.userAgent || hasMeta;
                  return (
                    <div key={log.id} className="group">
                      <button
                        type="button"
                        onClick={() => hasAux && setExpandedId(expanded ? null : log.id)}
                        className="w-full flex items-start gap-[var(--sp-3)] p-[var(--sp-3)] hover:bg-[var(--sf-h)] text-left transition-colors"
                        disabled={!hasAux}
                      >
                        <div
                          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--sf-h)', color: em.color }}
                        >
                          <EntityIcon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-[13px]">
                            <span className="font-medium">{renderActor(log)}</span>
                            <Badge variant={am.variant}>{am.label}</Badge>
                            <span className="text-[var(--tx3)]">·</span>
                            <span className="text-[var(--tx2)]">{em.label}</span>
                          </div>
                          <div className="text-[13px] text-[var(--tx)] mt-1 line-clamp-2">{log.description}</div>
                          <div className="text-[11px] text-[var(--tx3)] mt-1 flex items-center gap-3">
                            <span>{formatRelativePl(log.createdAt)}</span>
                            {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                            {hasMeta && <span>· {Object.keys(log.metadata!).length} pól metadata</span>}
                          </div>
                        </div>
                        {hasAux && (
                          <div className="shrink-0 text-[var(--tx3)] pt-2">
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                        )}
                      </button>
                      {expanded && hasAux && (
                        <div className="px-[var(--sp-3)] pb-[var(--sp-3)] pl-[calc(var(--sp-3)+2rem+var(--sp-3))]">
                          <div className="rounded-[var(--r-s)] bg-[var(--sf-h)] border border-[var(--bd)] p-3 space-y-2 text-[12px]">
                            {log.ipAddress && (
                              <div className="flex gap-2">
                                <span className="text-[var(--tx3)] w-20 shrink-0">IP:</span>
                                <code className="text-[var(--tx)]">{log.ipAddress}</code>
                              </div>
                            )}
                            {log.userAgent && (
                              <div className="flex gap-2">
                                <span className="text-[var(--tx3)] w-20 shrink-0">User Agent:</span>
                                <code className="text-[var(--tx2)] break-all">{log.userAgent}</code>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <span className="text-[var(--tx3)] w-20 shrink-0">Entity ID:</span>
                              <code className="text-[var(--tx2)]">{log.entityId}</code>
                            </div>
                            {hasMeta && (
                              <div>
                                <div className="text-[var(--tx3)] mb-1">Metadata:</div>
                                <pre className="text-[11px] text-[var(--tx2)] whitespace-pre-wrap overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
