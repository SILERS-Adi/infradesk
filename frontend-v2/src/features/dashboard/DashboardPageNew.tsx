// @ts-nocheck — WIP DS migration, depnący na @silers/design-system które jeszcze
// nie jest jako workspace package. Plik aktywny tylko z ?ui=new flag (default
// routing -> DashboardPageLegacy). Pomijamy tsc do czasu finalizacji DS-package.
/**
 * DashboardPageNew — DS-based migracja /dashboard (Faza 2D Batch 1).
 *
 * Aktywowana przez feature flag `?ui=new` (patrz @/lib/uiFlag).
 * Bez flagi: routing kieruje do DashboardPageLegacy (zachowany 1:1).
 *
 * Zachowuje wszystkie produkcyjne dane i sekcje z legacy:
 *  - Iris hero (input + suggestions)
 *  - SLA gauge + summary stats
 *  - 4 KPI StatsCards
 *  - Agent versions widget
 *  - Recent tickets list
 *  - Onboarding checklist (jako-jest, InfraDesk feature)
 *  - Confirmation toast po ?paid=ok (legacy zachowanie)
 *
 * Zmiany wizualne:
 *  - IDCore (canvas) → DS IrisCoreButton (SVG)
 *  - StatCard → DS StatsCard
 *  - Card/CardHeader/CardContent → DS Card/CardHeader/CardBody
 *  - Gauge (custom) → DS Gauge z thresholds
 *  - Recent tickets div+divide → DS DataTable
 *  - Tailwind utility colors → DS tokens
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock, RefreshCw, Send, Server, Ticket as TicketIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type DataTableColumn,
  Gauge,
  Input,
  PriorityIndicator,
  StatsCard,
  StatusPill,
} from '@silers/design-system/primitives';
import { IrisCoreButton } from '@silers/design-system/visuals';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatRelativePl } from '@/lib/utils';
import { mapStatus } from '@/features/_helpers/statusMap';
import { OnboardingChecklist } from './OnboardingChecklist';

import './DashboardPageNew.css';

interface TicketRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface OverviewResp {
  summary: {
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    activeAlerts: number;
    criticalAlerts: number;
    avgAuditScore: number | null;
    highAlerts?: number;
    slaCompliancePct?: number | null;
  };
}

interface AgentVersionStats {
  total: number;
  online5m: number;
  offline1d: number;
  neverSeen: number;
  latest: string;
  outdated: number;
  byVersion: Record<string, number>;
}

const IRIS_SUGGESTIONS = [
  'Pokaż otwarte krytyczne tickety',
  'Które urządzenia nie raportowały dziś?',
  'Podsumuj co się działo wczoraj',
  'Zestawienie rozliczeń za ten miesiąc',
];

type IrisVisualStatus = 'idle' | 'active' | 'processing' | 'warning' | 'danger';

function deriveIrisStatus(sum: OverviewResp['summary'] | undefined): IrisVisualStatus {
  if (!sum) return 'idle';
  if ((sum.criticalAlerts ?? 0) > 0) return 'danger';
  if ((sum.highAlerts ?? 0) > 0) return 'warning';
  if ((sum.activeAlerts ?? 0) > 0) return 'processing';
  return 'active';
}

export function DashboardPageNew() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [irisQ, setIrisQ] = useState('');

  // Confirmation toast po ?paid=ok (zachowanie z legacy)
  useEffect(() => {
    if (searchParams.get('paid') === 'ok') {
      toast.success('🎉 Płatność przyjęta — plan zostanie aktywowany w ciągu kilku minut.');
      const next = new URLSearchParams(searchParams);
      next.delete('paid');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const ticketsQ = useQuery<{ items: TicketRow[] }>({
    queryKey: ['dashboard', 'recent-tickets'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 10 } })).data,
  });

  const overviewQ = useQuery<OverviewResp>({
    queryKey: ['dashboard', 'monitoring-overview'],
    queryFn: async () => (await api.get('/monitoring/overview')).data,
    refetchInterval: 60_000,
    retry: false,
  });

  const sessionsQ = useQuery<{ stats: { active: number } }>({
    queryKey: ['dashboard', 'sessions-stats'],
    queryFn: async () => (await api.get('/sessions/stats')).data,
    refetchInterval: 60_000,
    retry: false,
  });

  const agentsQ = useQuery<AgentVersionStats>({
    queryKey: ['agent-version-stats'],
    queryFn: async () => (await api.get('/agents/admin/version-stats')).data,
    staleTime: 60_000,
    retry: false,
  });

  const items = ticketsQ.data?.items ?? [];
  const open = items.filter((t) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
  const critical = items.filter((t) => t.priority === 'CRITICAL').length;
  const inProgress = items.filter((t) => t.status === 'IN_PROGRESS').length;

  const sum = overviewQ.data?.summary;
  const slaPct: number | null = sum?.slaCompliancePct ?? null;
  const irisStatus = deriveIrisStatus(sum);

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';

  function askIris(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      navigate('/ai');
      return;
    }
    navigate(`/ai?q=${encodeURIComponent(trimmed)}`);
  }

  const ticketColumns: DataTableColumn<TicketRow>[] = [
    {
      key: 'priority',
      header: '',
      width: '32px',
      cell: (t) => {
        const lvl = (t.priority?.toLowerCase() ?? 'medium') as 'low' | 'medium' | 'high' | 'critical';
        const safe = (['low', 'medium', 'high', 'critical'] as const).includes(lvl) ? lvl : 'medium';
        return <PriorityIndicator level={safe} size="sm" />;
      },
    },
    {
      key: 'ticketNumber',
      header: 'Numer',
      variant: 'mono',
      width: '120px',
    },
    {
      key: 'title',
      header: 'Tytuł',
      sortable: true,
    },
    {
      key: 'createdAt',
      header: 'Utworzono',
      variant: 'muted',
      cell: (t) => formatRelativePl(t.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => {
        const s = mapStatus('ticket', t.status);
        return <StatusPill status={s.status} label={s.label} />;
      },
    },
  ];

  return (
    <div className="dashboard-new">
      <OnboardingChecklist />

      <header className="dashboard-new__header">
        <div>
          <h1 className="dashboard-new__greeting">
            {greeting}{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="dashboard-new__subtitle">
            {open.length > 0
              ? `${open.length} otwartych zgłoszeń · ${critical} krytycznych · ${inProgress} w toku`
              : 'Brak otwartych zgłoszeń — spokój.'}
          </p>
        </div>
        <Button
          variant="ghost"
          iconOnly
          aria-label="Odśwież"
          title="Odśwież"
          loading={ticketsQ.isFetching}
          onClick={() => ticketsQ.refetch()}
        >
          <RefreshCw size={16} />
        </Button>
      </header>

      {/* Iris hero */}
      <Card>
        <CardBody>
          <div className="dashboard-new__hero">
            <IrisCoreButton
              size="xl"
              status={irisStatus}
              aria-label="Otwórz Iris — asystent AI"
              onClick={() => navigate('/ai')}
            />
            <div>
              <p className="dashboard-new__hero-eyebrow">Iris</p>
              <h2 className="dashboard-new__hero-title">Asystent AI Twojej infrastruktury</h2>
              <p className="dashboard-new__hero-description">
                Zapytaj o tickety, urządzenia, klientów i rozliczenia. Iris zna Twój workspace i odpowie w ciągu sekund.
              </p>
              <form
                onSubmit={(e) => { e.preventDefault(); askIris(irisQ); }}
                className="dashboard-new__hero-form"
              >
                <div className="dashboard-new__hero-input">
                  <Input
                    value={irisQ}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIrisQ(e.target.value)}
                    placeholder="Zapytaj Iris…"
                    aria-label="Zapytaj Iris"
                  />
                </div>
                <Button variant="primary" type="submit" iconStart={<Send size={14} />}>
                  Zapytaj
                </Button>
              </form>
              <div className="dashboard-new__suggestions">
                {IRIS_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => askIris(s)}
                    className="dashboard-new__suggestion"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* SLA + summary */}
      <Card>
        <CardBody>
          <div className="dashboard-new__sla">
            {slaPct != null ? (
              <Gauge
                value={slaPct}
                label="SLA zgodność"
                size="lg"
                thresholds={[
                  { min: 0,  variant: 'danger' },
                  { min: 70, variant: 'warning' },
                  { min: 90, variant: 'success' },
                ]}
              />
            ) : (
              <Gauge
                value={0}
                unit={null}
                label="SLA — brak danych"
                size="lg"
                variant="muted"
                center={<span className="dashboard-new__gauge-empty">—</span>}
              />
            )}
            <div className="dashboard-new__sla-summary">
              <p className="dashboard-new__sla-eyebrow">Dzisiaj w liczbach</p>
              <StatsCard
                label="Otwarte"
                value={open.length}
                accent="primary"
                icon={<TicketIcon size={18} />}
              />
              <StatsCard
                label="Krytyczne"
                value={critical}
                accent="danger"
                icon={<AlertTriangle size={18} />}
              />
              <StatsCard
                label="W toku"
                value={inProgress}
                accent="warning"
                icon={<Clock size={18} />}
              />
              <StatsCard
                label="Urządzenia online"
                value={sum ? sum.onlineDevices : '—'}
                accent="success"
                icon={<Server size={18} />}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 4 KPI */}
      <div className="dashboard-new__stats">
        <StatsCard
          label="Otwarte zgłoszenia"
          value={open.length}
          accent="primary"
          icon={<TicketIcon size={18} />}
        />
        <StatsCard
          label="Krytyczne"
          value={critical}
          accent="danger"
          icon={<AlertTriangle size={18} />}
        />
        <StatsCard
          label="Urządzenia"
          value={sum ? sum.totalDevices : '—'}
          accent="info"
          icon={<Server size={18} />}
          hint={sum ? `${sum.onlineDevices} online · ${sum.offlineDevices} offline` : undefined}
        />
        <StatsCard
          label="Aktywne sesje"
          value={sessionsQ.data?.stats.active ?? '—'}
          accent="warning"
          icon={<Clock size={18} />}
        />
      </div>

      {/* Agent versions */}
      {agentsQ.data && agentsQ.data.total > 0 && (
        <Card>
          <CardHeader
            title="Asystenci — wersje"
            subtitle={`Online: ${agentsQ.data.online5m} · Offline (>24h): ${agentsQ.data.offline1d} · Total: ${agentsQ.data.total}`}
          />
          <CardBody>
            {agentsQ.data.outdated > 0 && (
              <div className="dashboard-new__alert" role="alert">
                <AlertTriangle size={16} />
                <span>
                  {agentsQ.data.outdated} asystentów ma starszą wersję niż <strong>v{agentsQ.data.latest}</strong>. Auto-update w ciągu 2h.
                </span>
              </div>
            )}
            <div className="dashboard-new__versions">
              {Object.entries(agentsQ.data.byVersion)
                .sort((a, b) => b[1] - a[1])
                .map(([v, n]) => (
                  <div
                    key={v}
                    className="dashboard-new__version-card"
                    data-tone={v === agentsQ.data!.latest ? 'latest' : v === 'unknown' ? 'unknown' : undefined}
                  >
                    <span className="dashboard-new__version-label">v{v}</span>
                    <span className="dashboard-new__version-count">{n}</span>
                  </div>
                ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent tickets */}
      <Card>
        <CardHeader
          title="Ostatnie zgłoszenia"
          actions={
            <Button variant="link" onClick={() => navigate('/tickets')}>
              Wszystkie →
            </Button>
          }
        />
        <CardBody>
          <div data-density="compact">
            <DataTable
              columns={ticketColumns}
              data={items}
              rowKey="id"
              loading={ticketsQ.isLoading}
              emptyTitle="Brak zgłoszeń"
              emptyDescription="Wszystkie zostały zamknięte. Dobrze się spisałeś."
              onRowClick={(row: TicketRow) => navigate(`/tickets/${row.id}`)}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
