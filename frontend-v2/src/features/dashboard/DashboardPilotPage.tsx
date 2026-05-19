/**
 * DashboardPilotPage — Faza 2B pilot migracji InfraDesk na Silers Design System.
 *
 * Trasa: /dashboard-pilot
 *
 * Cel:
 *  - Renderuje DS AppShell + Sidebar + Topbar (zamiast globalnego layoutu).
 *  - Treść: StatsCard row, Tabs (Tickets / Agents), DataTable, Toast.
 *  - Logika danych = ta sama co istniejący /dashboard (read-only queries).
 *  - Status mapping przez src/features/_helpers/statusMap.ts.
 *
 * NIE zastępuje /dashboard — działa obok.
 * NIE renderuje IRIS hero / Gauge / OnboardingChecklist — te są InfraDesk-specific
 * i będą portowane w Fazie 2C (osobny PR).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Building,
  Calendar,
  Clock,
  Cog,
  HardDriveDownload,
  LayoutDashboard,
  LogOut,
  Server,
  Ticket as TicketIcon,
  Users,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useThemeStore } from '@/store/theme';
import { mapPriority, mapStatus } from '@/features/_helpers/statusMap';

import {
  AppShell,
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type DataTableColumn,
  Sidebar,
  SidebarItem,
  SidebarSection,
  StatsCard,
  StatusPill,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  ToastProvider,
  Topbar,
  TopbarBurger,
  TopbarTitle,
  useToast,
} from '@silers/design-system/primitives';

import './DashboardPilotPage.css';

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

interface VersionRow {
  version: string;
  count: number;
  isLatest: boolean;
  isUnknown: boolean;
}

const STATUS_TO_BADGE_VARIANT: Record<string, BadgeVariant> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
  pending: 'neutral',
};

export function DashboardPilotPage() {
  return (
    <ToastProvider position="bottom-right">
      <DashboardPilotInner />
    </ToastProvider>
  );
}

function DashboardPilotInner() {
  const { user, logout } = useAuthStore();
  const themeMode = useThemeStore((s) => s.theme);
  const setThemeMode = useThemeStore((s) => s.setTheme);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toast = useToast();

  // Dane — read-only, identyczne queryKey jak DashboardPage żeby cache się reusował.
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
  const sum = overviewQ.data?.summary;
  const totalDevices = sum?.totalDevices ?? '—';
  const activeSessions = sessionsQ.data?.stats.active ?? '—';

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';
  })();

  const versionRows: VersionRow[] = agentsQ.data
    ? Object.entries(agentsQ.data.byVersion)
        .sort((a, b) => b[1] - a[1])
        .map(([version, count]) => ({
          version,
          count,
          isLatest: version === agentsQ.data!.latest,
          isUnknown: version === 'unknown',
        }))
    : [];

  const ticketColumns: DataTableColumn<TicketRow>[] = [
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
      key: 'priority',
      header: 'Priorytet',
      cell: (t) => {
        const p = mapPriority(t.priority);
        return <Badge variant={STATUS_TO_BADGE_VARIANT[p.status]} tone="soft">{p.label}</Badge>;
      },
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

  const versionColumns: DataTableColumn<VersionRow>[] = [
    {
      key: 'version',
      header: 'Wersja',
      variant: 'mono',
      cell: (r) => `v${r.version}`,
    },
    {
      key: 'count',
      header: 'Liczba',
      variant: 'number',
      align: 'right',
      sortable: true,
    },
    {
      key: 'state',
      header: 'Status',
      cell: (r) =>
        r.isLatest ? (
          <StatusPill status="success" label="Najnowsza" />
        ) : r.isUnknown ? (
          <StatusPill status="danger" label="Nieznana" />
        ) : (
          <StatusPill status="warning" label="Starsza" />
        ),
    },
  ];

  function cycleTheme() {
    const next = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
    setThemeMode(next);
    toast.show({
      variant: 'info',
      title: 'Motyw zmieniony',
      description: `Aktywny: ${next}`,
      duration: 2500,
    });
  }

  const sidebar = (
    <Sidebar
      header={
        <div className="dashboard-pilot__brand">
          <img src="/logo-icon.png" alt="" />
          <strong>InfraDesk · Pilot</strong>
        </div>
      }
      footer={
        user ? (
          <div className="dashboard-pilot__user">
            <div className="dashboard-pilot__user-info">
              <div className="dashboard-pilot__user-name">{user.firstName} {user.lastName}</div>
              <div className="dashboard-pilot__user-email">{user.email}</div>
            </div>
            <Button variant="ghost" iconOnly aria-label="Wyloguj" size="sm" onClick={logout}>
              <LogOut size={16} />
            </Button>
          </div>
        ) : null
      }
    >
      <SidebarSection label="Operacje">
        <SidebarItem icon={<LayoutDashboard size={18} />} label="Kokpit (pilot)" active />
        <SidebarItem icon={<TicketIcon size={18} />} label="Zgłoszenia" onClick={() => navigate('/tickets')} />
        <SidebarItem icon={<Calendar size={18} />} label="Kalendarz" onClick={() => navigate('/calendar')} />
        <SidebarItem icon={<Clock size={18} />} label="Sesje pracy" onClick={() => navigate('/sessions')} />
      </SidebarSection>
      <SidebarSection label="Infrastruktura">
        <SidebarItem icon={<Server size={18} />} label="Urządzenia" onClick={() => navigate('/devices')} />
        <SidebarItem icon={<Zap size={18} />} label="Asystenci" onClick={() => navigate('/agents')} />
        <SidebarItem icon={<HardDriveDownload size={18} />} label="Kopie zapasowe" onClick={() => navigate('/backups')} />
      </SidebarSection>
      <SidebarSection label="Moja firma">
        <SidebarItem icon={<Building size={18} />} label="Moje dane" onClick={() => navigate('/my-company')} />
        <SidebarItem icon={<Users size={18} />} label="Użytkownicy" onClick={() => navigate('/users')} />
        <SidebarItem icon={<Cog size={18} />} label="Ustawienia" onClick={() => navigate('/settings')} />
      </SidebarSection>
    </Sidebar>
  );

  const topbar = (
    <Topbar
      left={
        <>
          <TopbarBurger onClick={() => setSidebarOpen((v) => !v)} />
          <TopbarTitle>Kokpit (pilot DS)</TopbarTitle>
        </>
      }
      right={
        <>
          <Button variant="ghost" iconOnly aria-label={`Motyw: ${themeMode}`} onClick={cycleTheme}>
            <span className="dashboard-pilot__theme-glyph">
              {themeMode === 'light' ? '☀' : themeMode === 'dark' ? '☾' : 'A'}
            </span>
          </Button>
          <Button variant="ghost" iconOnly aria-label="Powiadomienia">
            <Bell size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard')}>
            ← Stary kokpit
          </Button>
        </>
      }
    />
  );

  return (
    <AppShell
      topbar={topbar}
      sidebar={sidebar}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
    >
      <div className="dashboard-pilot">
        <header className="dashboard-pilot__header">
          <div>
            <h1 className="dashboard-pilot__greeting">
              {greeting}{user?.firstName ? `, ${user.firstName}` : ''}!
            </h1>
            <p className="dashboard-pilot__subtitle">
              {open.length > 0
                ? `${open.length} otwartych zgłoszeń · ${critical} krytycznych`
                : 'Brak otwartych zgłoszeń — spokój.'}
            </p>
          </div>
          <Badge variant="primary" tone="soft" size="lg">PILOT · Faza 2B</Badge>
        </header>

        <div className="dashboard-pilot__stats">
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
            value={totalDevices}
            accent="info"
            icon={<Server size={18} />}
            hint={sum ? `${sum.onlineDevices} online · ${sum.offlineDevices} offline` : undefined}
          />
          <StatsCard
            label="Aktywne sesje"
            value={activeSessions}
            accent="warning"
            icon={<Clock size={18} />}
          />
        </div>

        <Card>
          <CardHeader
            title="Aktywność operacyjna"
            subtitle="Ostatnie zgłoszenia i wersje wdrożonych asystentów"
          />
          <CardBody>
            <div data-density="compact">
              <Tabs defaultValue="tickets">
                <TabsList>
                  <TabsTab value="tickets">
                    Ostatnie zgłoszenia
                    {open.length > 0 && (
                      <Badge variant="primary" tone="soft" size="sm">{open.length}</Badge>
                    )}
                  </TabsTab>
                  <TabsTab value="agents">
                    Asystenci
                    {agentsQ.data && agentsQ.data.outdated > 0 && (
                      <Badge variant="warning" tone="soft" size="sm">{agentsQ.data.outdated} starsze</Badge>
                    )}
                  </TabsTab>
                </TabsList>
                <TabsPanel value="tickets">
                  <DataTable
                    columns={ticketColumns}
                    data={items}
                    rowKey="id"
                    loading={ticketsQ.isLoading}
                    emptyTitle="Brak zgłoszeń"
                    emptyDescription="Wszystkie tickety zostały zamknięte. Dobrze się spisałeś."
                    onRowClick={(row) => navigate(`/tickets/${row.id}`)}
                  />
                </TabsPanel>
                <TabsPanel value="agents">
                  <DataTable
                    columns={versionColumns}
                    data={versionRows}
                    rowKey="version"
                    loading={agentsQ.isLoading}
                    emptyTitle="Brak asystentów"
                    emptyDescription="Żaden asystent jeszcze się nie zarejestrował."
                  />
                </TabsPanel>
              </Tabs>
            </div>
          </CardBody>
        </Card>

        <Card accent="primary">
          <CardHeader title="Pilot Silers Design System" subtitle="Faza 2B — tylko ten ekran, reszta InfraDesk bez zmian." />
          <CardBody>
            <p className="dashboard-pilot__intro">
              Ten widok korzysta wyłącznie z primitive&apos;ów <code>@silers/design-system/primitives</code>:
              AppShell, Sidebar, Topbar, Card, StatsCard, Tabs, DataTable, Button, Badge, StatusPill, Toast.
              Dane są pobierane z tych samych endpointów co produkcyjny kokpit (read-only).
              Pełna dokumentacja: <code>silers-design-system/docs/MIGRATION_PLAYBOOK.md</code>.
            </p>
            <div className="dashboard-pilot__actions">
              <Button
                variant="primary"
                onClick={() =>
                  toast.show({
                    variant: 'success',
                    title: 'Toast działa',
                    description: 'ToastProvider + useToast z DS prawidłowo zarejestrowany.',
                  })
                }
              >
                Test toasta
              </Button>
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                Wróć do produkcyjnego kokpitu
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
