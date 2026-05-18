import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronLeft, Activity, Settings, Shield, Ticket as TicketIcon, HardDrive,
  Wifi, Monitor as MonitorIcon, KeyRound, Zap, Loader2, Eye, EyeOff, Plus,
  Power, RefreshCw, Download, PlayCircle, Trash2, Edit3,
  AlertTriangle, CheckCircle2, Database, Copy, Share2, X,
} from 'lucide-react';
import { PartnerShareDialog, type ShareResourceType } from '@/features/partner-shares/PartnerShareDialog';
import { RemoteLaunchLink } from '@/components/ui/RemoteLaunchLink';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PriorityDot } from '@/components/ui/PriorityDot';
import BackupWizard from '@/features/backups/BackupWizard';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

// ── Types ────────────────────────────────────────────────────────────────────

type TabKey =
  | 'overview' | 'config' | 'security' | 'tickets'
  | 'backups' | 'network' | 'sessions' | 'vault' | 'actions';

interface Device {
  id: string;
  name: string;
  hostname: string | null;
  category: string;
  criticality: string;
  status: string;
  assetTag: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  qrCodeValue: string;
  purchaseDate: string | null;
  installationDate: string | null;
  warrantyUntil: string | null;
  assignedUserId: string | null;
  managerId: string | null;
  rustdeskId: string | null;
  rdpAddress: string | null;
  sshAddress: string | null;
  anydeskId: string | null;
  teamviewerId: string | null;
  customRemoteLink: string | null;
  description: string | null;
  internalNotes: string | null;
  clientVisibleNotes: string | null;
  workspaceId: string;
  workspace?: { id: string; name: string; type: string } | null;
  location?: { id: string; name: string; city: string | null } | null;
  agent?: AgentInfo | null;
  _count?: { tickets: number; alerts: number };
}

interface AgentInfo {
  id: string;
  status: string;
  lastSeen: string | null;
  agentVersion: string;
  hostname: string;
  currentUser: string | null;
  cpuModel: string | null;
  ramMb: number | null;
  diskFreeGb: number | null;
  diskTotalGb: number | null;
  osName: string | null;
  osVersion: string | null;
  allowMonitoring: boolean;
  allowRustdesk: boolean;
  allowRemoteCommands: boolean;
  serverMetrics: Record<string, unknown> | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  WORKSTATION: 'Komputer', SERVER: 'Serwer', ROUTER: 'Router', SWITCH: 'Switch',
  FIREWALL: 'Firewall', PRINTER: 'Drukarka', SCANNER: 'Skaner', CCTV: 'Kamera',
  PHONE: 'Telefon', IOT: 'IoT', OTHER: 'Inne',
};

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: 'overview', label: 'Przegląd',         icon: Activity },
  { key: 'config',   label: 'Konfiguracja',     icon: Settings },
  { key: 'security', label: 'Bezpieczeństwo',   icon: Shield },
  { key: 'tickets',  label: 'Zgłoszenia',       icon: TicketIcon },
  { key: 'backups',  label: 'Kopie',            icon: HardDrive },
  { key: 'network',  label: 'Sieć',             icon: Wifi },
  { key: 'sessions', label: 'Sesje',            icon: MonitorIcon },
  { key: 'vault',    label: 'Sejf haseł',       icon: KeyRound },
  { key: 'actions',  label: 'Akcje',            icon: Zap },
];

// ── Main page ────────────────────────────────────────────────────────────────

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>('overview');

  const { data, isLoading, error } = useQuery<{ device: Device }>({
    queryKey: ['device', id],
    queryFn: async () => (await api.get(`/devices/${id}`)).data,
    enabled: !!id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-tx3" />
      </div>
    );
  }
  if (error || !data?.device) {
    return (
      <div className="space-y-3 anim-up">
        <Link to="/devices" className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press">
          <ChevronLeft className="h-4 w-4" /> Urządzenia
        </Link>
        <Card className="p-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-er" />
          <p className="text-tx font-medium">Nie znaleziono urządzenia</p>
          <p className="text-[13px] text-tx3 mt-1">Mogło zostać usunięte albo nie masz do niego dostępu.</p>
        </Card>
      </div>
    );
  }

  const d = data.device;
  const agent = d.agent ?? null;
  const isOnline = agent?.status === 'ACTIVE' && agent.lastSeen
    ? Date.now() - new Date(agent.lastSeen).getTime() < 5 * 60_000
    : false;

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Link to="/devices" className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press shrink-0 mt-1">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[22px] font-bold text-tx truncate">{d.name}</h1>
            <Badge variant={isOnline ? 'success' : agent ? 'neutral' : 'warning'}>
              {isOnline ? 'Online' : agent ? 'Offline' : 'Bez agenta'}
            </Badge>
            <Badge variant={d.status === 'ACTIVE' ? 'success' : d.status === 'DECOMMISSIONED' ? 'danger' : 'neutral'}>
              {d.status === 'ACTIVE' ? 'Aktywne' : d.status === 'INACTIVE' ? 'Nieaktywne' : 'Wycofane'}
            </Badge>
            <PriorityDot priority={d.criticality} withLabel />
          </div>
          <div className="text-[12px] text-tx3 mt-1 flex items-center gap-3 flex-wrap">
            <span>{CATEGORY_LABEL[d.category] ?? d.category}</span>
            {d.hostname && <span className="font-mono">{d.hostname}</span>}
            {d.ipAddress && <span className="font-mono">{d.ipAddress}</span>}
            {d.location && <span>📍 {d.location.name}{d.location.city && ` · ${d.location.city}`}</span>}
            {agent?.lastSeen && <span>Ostatnio: {formatRelative(agent.lastSeen)}</span>}
            {agent?.agentVersion && <span className="font-mono">v{agent.agentVersion}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-bd">
        <div className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 whitespace-nowrap press',
                  active ? 'text-tx border-pri' : 'text-tx3 border-transparent hover:text-tx',
                ].join(' ')}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab device={d} agent={agent} isOnline={isOnline} />}
      {tab === 'config'   && <ConfigTab   device={d} agent={agent} />}
      {tab === 'security' && <SecurityTab device={d} agent={agent} />}
      {tab === 'tickets'  && <TicketsTab  deviceId={d.id} />}
      {tab === 'backups'  && <BackupsTab  device={d} agent={agent} />}
      {tab === 'network'  && <NetworkTab  device={d} agent={agent} />}
      {tab === 'sessions' && <SessionsTab device={d} />}
      {tab === 'vault'    && <VaultTab    deviceId={d.id} />}
      {tab === 'actions'  && <ActionsTab  device={d} agent={agent} isOnline={isOnline} />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

interface PartnerShareRow {
  id: string;
  resourceType: 'DEVICE' | 'CREDENTIAL' | 'RUSTDESK_LAUNCH';
  resourceId: string;
  partnerEmail: string | null;
  partnerName: string | null;
  note: string | null;
  expiresAt: string;
  usedAt: string | null;
  accessCount: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  shareUrl: string | null;
}

function PartnerSharesBox({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ shares: PartnerShareRow[] }>({
    queryKey: ['partner-shares', 'list'],
    queryFn: async () => (await api.get('/partner-shares')).data,
    refetchInterval: 60_000,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/partner-shares/${id}`)).data,
    onSuccess: () => {
      toast.success('Share odwołany');
      qc.invalidateQueries({ queryKey: ['partner-shares'] });
    },
    onError: () => toast.error('Nie udało się odwołać'),
  });

  const deviceShares = (data?.shares ?? []).filter(
    (s) => s.resourceId === deviceId && (s.resourceType === 'DEVICE' || s.resourceType === 'RUSTDESK_LAUNCH'),
  );
  const active = deviceShares.filter((s) => s.status === 'ACTIVE');

  if (deviceShares.length === 0) return null;

  return (
    <Card className="p-5">
      <h3 className="text-[14px] font-semibold text-tx mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-pri" />
        Udostępnione partnerom
        {active.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}>
            {active.length} aktywne
          </span>
        )}
      </h3>
      <ul className="space-y-2">
        {deviceShares.slice(0, 6).map((s) => {
          const minutesLeft = Math.max(0, Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 60_000));
          const expiryLabel =
            s.status === 'REVOKED' ? 'Odwołany'
              : s.status === 'EXPIRED' ? 'Wygasł'
                : s.status === 'USED' && s.resourceType === 'CREDENTIAL' ? 'Użyty (jednorazowy)'
                  : minutesLeft < 60 ? `${minutesLeft} min`
                    : minutesLeft < 60 * 24 ? `${Math.floor(minutesLeft / 60)} h`
                      : `${Math.floor(minutesLeft / 60 / 24)} dni`;
          return (
            <li
              key={s.id}
              className="rounded-[var(--r-s)] border p-2.5 flex items-start gap-2"
              style={{
                borderColor: s.status === 'ACTIVE' ? 'var(--ok)' : 'var(--bd)',
                background: s.status === 'ACTIVE' ? 'color-mix(in srgb, var(--ok) 5%, var(--sf))' : 'var(--sf)',
                opacity: s.status === 'ACTIVE' ? 1 : 0.7,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--r-xs)]"
                        style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}>
                    {s.resourceType === 'RUSTDESK_LAUNCH' ? 'RustDesk' : 'Pełne urządzenie'}
                  </span>
                  <span className="text-[12px] font-semibold text-tx truncate">
                    {s.partnerName || s.partnerEmail || '— bez nazwy —'}
                  </span>
                </div>
                {s.partnerEmail && s.partnerName && <div className="text-[10px] text-tx3 truncate">{s.partnerEmail}</div>}
                {s.note && <div className="text-[11px] text-tx3 truncate italic mt-0.5">„{s.note}"</div>}
                <div className="text-[11px] text-tx3 mt-1 flex items-center gap-2 flex-wrap">
                  <span title={new Date(s.expiresAt).toLocaleString('pl-PL')}>{expiryLabel}</span>
                  {s.accessCount > 0 && (
                    <span style={{ color: 'var(--tx2)' }}>· użyte {s.accessCount}×</span>
                  )}
                </div>
              </div>
              {s.status === 'ACTIVE' && (
                <div className="flex flex-col gap-1 shrink-0">
                  {s.shareUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(s.shareUrl!).then(() => toast.success('Link skopiowany'));
                      }}
                      className="p-1 rounded-[var(--r-xs)] text-tx3 hover:text-pri hover:bg-sf-h press"
                      title="Kopiuj link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Odwołać ten share?',
                        message: 'Partner straci dostęp natychmiast. Akcja nieodwracalna.',
                        confirmLabel: 'Odwołaj',
                        danger: true,
                      });
                      if (ok) revokeMut.mutate(s.id);
                    }}
                    className="p-1 rounded-[var(--r-xs)] text-tx3 hover:text-er hover:bg-sf-h press"
                    title="Odwołaj"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {deviceShares.length > 6 && (
        <Link to="/partners" className="text-[11px] text-pri hover:underline press mt-2 inline-block">
          Zobacz wszystkie ({deviceShares.length}) →
        </Link>
      )}
    </Card>
  );
}

function ContactBox({ agent }: { agent: AgentInfo | null }) {
  const fullName = [agent?.contactFirstName, agent?.contactLastName].filter(Boolean).join(' ').trim();
  const hasAny = !!(fullName || agent?.contactEmail || agent?.contactPhone || agent?.companyName);
  return (
    <Card className="p-5">
      <h3 className="text-[14px] font-semibold text-tx mb-3">Osoba kontaktowa</h3>
      {hasAny ? (
        <KvList items={[
          ['Imię i nazwisko', fullName || '—'],
          ['E-mail',          agent?.contactEmail ? <a key="e" href={`mailto:${agent.contactEmail}`} className="text-[var(--accent)] hover:underline">{agent.contactEmail}</a> : '—'],
          ['Telefon',         agent?.contactPhone ? <a key="p" href={`tel:${agent.contactPhone}`} className="text-[var(--accent)] hover:underline">{agent.contactPhone}</a> : '—'],
          ['Firma',           agent?.companyName ?? '—'],
          ['Aktualny user',   agent?.currentUser ?? '—'],
        ]} />
      ) : (
        <p className="text-[12px] text-tx2">Brak danych z rejestracji Asystenta.</p>
      )}
    </Card>
  );
}

function OverviewTab({ device: d, agent, isOnline }: { device: Device; agent: AgentInfo | null; isOnline: boolean }) {
  const sm = (agent?.serverMetrics as ServerMetricsBag | null) ?? null;
  const cpu = typeof sm?.cpuUsage === 'number' ? sm.cpuUsage : null;
  const ram = typeof sm?.ramUsage === 'number' ? sm.ramUsage : null;
  const diskFree = agent?.diskFreeGb;
  const diskTotal = agent?.diskTotalGb;
  const diskPct = diskFree && diskTotal ? Math.round(((diskTotal - diskFree) / diskTotal) * 100) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Status agenta" value={isOnline ? 'Online' : agent ? 'Offline' : '—'} tone={isOnline ? 'ok' : 'neutral'} />
          <StatCard label="CPU"  value={cpu  != null ? `${Math.round(cpu)}%` : '—'} tone={pctTone(cpu)} />
          <StatCard label="RAM"  value={ram  != null ? `${Math.round(ram)}%` : '—'} tone={pctTone(ram)} />
          <StatCard label="Dysk" value={diskPct != null ? `${diskPct}%` : '—'} tone={pctTone(diskPct, true)} />
        </div>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Sprzęt</h3>
          <KvList items={[
            ['Producent / Model', joinNN(d.manufacturer, d.model)],
            ['Numer seryjny',    d.serialNumber ?? '—'],
            ['System operacyjny', joinNN(d.operatingSystem ?? agent?.osName, d.osVersion ?? agent?.osVersion)],
            ['CPU',              agent?.cpuModel ?? '—'],
            ['RAM',              agent?.ramMb ? `${(agent.ramMb / 1024).toFixed(1)} GB` : '—'],
            ['Dysk',             diskFree && diskTotal
              ? `${diskFree.toFixed(1)} / ${diskTotal.toFixed(1)} GB wolne`
              : '—'],
            ['Aktualny user',    agent?.currentUser ?? '—'],
          ]} />
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Sieć</h3>
          <KvList items={[
            ['IP',  d.ipAddress  ?? '—'],
            ['MAC', d.macAddress ?? '—'],
          ]} />
        </Card>
      </div>

      <div className="space-y-4">
        <ContactBox agent={agent} />

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Lokalizacja</h3>
          <KvList items={[
            ['Lokalizacja', d.location?.name ?? '—'],
            ['Miasto',      d.location?.city ?? '—'],
            ['Workspace',   d.workspace?.name ?? '—'],
          ]} />
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Gwarancja</h3>
          <KvList items={[
            ['Data zakupu',     fmtDate(d.purchaseDate)],
            ['Instalacja',      fmtDate(d.installationDate)],
            ['Gwarancja do',    fmtDate(d.warrantyUntil)],
          ]} />
          {d.warrantyUntil && (() => {
            const days = Math.ceil((new Date(d.warrantyUntil).getTime() - Date.now()) / 86400000);
            if (days < 0) return <p className="text-[12px] text-er mt-2">Gwarancja wygasła {Math.abs(days)} dni temu</p>;
            if (days < 60) return <p className="text-[12px] text-warn mt-2">Wygasa za {days} dni</p>;
            return null;
          })()}
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Statystyki</h3>
          <KvList items={[
            ['Otwarte zgłoszenia', String(d._count?.tickets ?? 0)],
            ['Aktywne alerty',     String(d._count?.alerts ?? 0)],
          ]} />
        </Card>

        <PartnerSharesBox deviceId={d.id} />
      </div>
    </div>
  );
}

// ── Config ───────────────────────────────────────────────────────────────────

function ConfigTab({ device: d, agent }: { device: Device; agent: AgentInfo | null }) {
  const qc = useQueryClient();
  const locationsQ = useQuery<{ locations: Array<{ id: string; name: string; city: string | null }> }>({
    queryKey: ['locations', d.workspaceId],
    queryFn: async () => (await api.get('/locations', { params: { workspaceId: d.workspaceId } })).data,
  });
  const [form, setForm] = useState({
    name: d.name,
    hostname: d.hostname ?? '',
    category: d.category,
    criticality: d.criticality,
    status: d.status,
    locationId: d.location?.id ?? '',
    serialNumber: d.serialNumber ?? '',
    manufacturer: d.manufacturer ?? '',
    model: d.model ?? '',
    ipAddress: d.ipAddress ?? '',
    macAddress: d.macAddress ?? '',
    operatingSystem: d.operatingSystem ?? '',
    osVersion: d.osVersion ?? '',
    rustdeskId: d.rustdeskId ?? '',
    rdpAddress: d.rdpAddress ?? '',
    sshAddress: d.sshAddress ?? '',
    anydeskId: d.anydeskId ?? '',
    teamviewerId: d.teamviewerId ?? '',
    customRemoteLink: d.customRemoteLink ?? '',
    purchaseDate:     d.purchaseDate     ? d.purchaseDate.slice(0, 10)     : '',
    installationDate: d.installationDate ? d.installationDate.slice(0, 10) : '',
    warrantyUntil:    d.warrantyUntil    ? d.warrantyUntil.slice(0, 10)    : '',
    description: d.description ?? '',
    internalNotes: d.internalNotes ?? '',
    clientVisibleNotes: d.clientVisibleNotes ?? '',
  });

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.patch(`/devices/${d.id}`, payload)).data,
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['device', d.id] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err: unknown) => toast.error(extractErr(err)),
  });

  const updateCaps = useMutation({
    mutationFn: async (payload: { allowMonitoring?: boolean; allowRustdesk?: boolean; allowRemoteCommands?: boolean }) =>
      (await api.patch(`/devices/${d.id}/agent-capabilities`, payload)).data,
    onSuccess: () => {
      toast.success('Uprawnienia agenta zaktualizowane');
      qc.invalidateQueries({ queryKey: ['device', d.id] });
    },
    onError: (err: unknown) => toast.error(extractErr(err)),
  });

  function save() {
    const payload: Record<string, unknown> = { ...form };
    // Convert empty strings to undefined so backend doesn't write empty values
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = undefined;
    }
    // Convert dates
    for (const k of ['purchaseDate', 'installationDate', 'warrantyUntil'] as const) {
      const v = form[k];
      if (v) payload[k] = new Date(v).toISOString();
    }
    update.mutate(payload);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Podstawowe</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nazwa" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Hostname" value={form.hostname} onChange={(v) => setForm({ ...form, hostname: v })} />
            <FieldSelect label="Kategoria" value={form.category} onChange={(v) => setForm({ ...form, category: v })}
              options={Object.entries(CATEGORY_LABEL).map(([k, l]) => ({ value: k, label: l }))} />
            <FieldSelect label="Priorytet" value={form.criticality} onChange={(v) => setForm({ ...form, criticality: v })}
              options={[{ value: 'LOW', label: 'Niski' }, { value: 'MEDIUM', label: 'Średni' }, { value: 'HIGH', label: 'Wysoki' }, { value: 'CRITICAL', label: 'Krytyczny' }]} />
            <FieldSelect label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={[{ value: 'ACTIVE', label: 'Aktywne' }, { value: 'INACTIVE', label: 'Nieaktywne' }, { value: 'DECOMMISSIONED', label: 'Wycofane' }]} />
            <FieldSelect
              label="Lokalizacja"
              value={form.locationId}
              onChange={(v) => setForm({ ...form, locationId: v })}
              options={[
                ...(form.locationId ? [] : [{ value: '', label: '— wybierz —' }]),
                ...((locationsQ.data?.locations ?? []).map((l) => ({
                  value: l.id,
                  label: l.city ? `${l.name} (${l.city})` : l.name,
                }))),
              ]}
            />
          </div>
          {locationsQ.isLoading && <p className="text-[11px] text-tx3 mt-2">Wczytywanie lokalizacji…</p>}
          {!locationsQ.isLoading && (locationsQ.data?.locations.length ?? 0) === 0 && (
            <p className="text-[11px] text-warn mt-2">
              Brak lokalizacji w tej firmie. <Link to="/locations" className="text-pri hover:underline">Dodaj lokalizację</Link>
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Sprzęt</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Producent" value={form.manufacturer} onChange={(v) => setForm({ ...form, manufacturer: v })} />
            <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            <Field label="Serial" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} />
            <Field label="System" value={form.operatingSystem} onChange={(v) => setForm({ ...form, operatingSystem: v })} />
            <Field label="Wersja OS" value={form.osVersion} onChange={(v) => setForm({ ...form, osVersion: v })} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Sieć</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IP" value={form.ipAddress} onChange={(v) => setForm({ ...form, ipAddress: v })} />
            <Field label="MAC" value={form.macAddress} onChange={(v) => setForm({ ...form, macAddress: v })} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Zdalny dostęp</h3>
          <div className="grid grid-cols-2 gap-3">
            <ConnectField label="RustDesk ID"        value={form.rustdeskId}       onChange={(v) => setForm({ ...form, rustdeskId: v })}       kind="rustdesk" />
            <ConnectField label="AnyDesk ID"         value={form.anydeskId}        onChange={(v) => setForm({ ...form, anydeskId: v })}        kind="anydesk" />
            <ConnectField label="TeamViewer ID"      value={form.teamviewerId}     onChange={(v) => setForm({ ...form, teamviewerId: v })}     kind="teamviewer" />
            <ConnectField label="RDP (host:port)"    value={form.rdpAddress}       onChange={(v) => setForm({ ...form, rdpAddress: v })}       kind="rdp" />
            <ConnectField label="SSH (user@host:port)" value={form.sshAddress}     onChange={(v) => setForm({ ...form, sshAddress: v })}       kind="ssh" />
            <ConnectField label="Inny link"          value={form.customRemoteLink} onChange={(v) => setForm({ ...form, customRemoteLink: v })} kind="custom" />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Gwarancja</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Data zakupu" type="date" value={form.purchaseDate} onChange={(v) => setForm({ ...form, purchaseDate: v })} />
            <Field label="Instalacja" type="date" value={form.installationDate} onChange={(v) => setForm({ ...form, installationDate: v })} />
            <Field label="Gwarancja do" type="date" value={form.warrantyUntil} onChange={(v) => setForm({ ...form, warrantyUntil: v })} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-4">Notatki</h3>
          <div className="space-y-3">
            <Textarea label="Opis (publiczny)" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
            <Textarea label="Notatki wewnętrzne (niewidoczne dla klienta)" value={form.internalNotes} onChange={(v) => setForm({ ...form, internalNotes: v })} />
            <Textarea label="Notatki widoczne dla klienta" value={form.clientVisibleNotes} onChange={(v) => setForm({ ...form, clientVisibleNotes: v })} />
          </div>
        </Card>

        <div className="flex justify-end gap-2 sticky bottom-2">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Edit3 className="h-4 w-4" /> Zapisz</>}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Uprawnienia agenta</h3>
          {!agent ? (
            <p className="text-[13px] text-tx3">Brak agenta — opcje niedostępne.</p>
          ) : (
            <div className="space-y-3">
              <Toggle
                label="Monitoring (CPU/RAM/dysk)"
                hint="Zatrzymaj wysyłanie metryk co 60s"
                value={agent.allowMonitoring}
                onChange={(v) => updateCaps.mutate({ allowMonitoring: v })}
              />
              <Toggle
                label="RustDesk (zdalny dostęp)"
                hint="Pozwól zainstalować RustDesk i zezwól helpdeskowi na zdalne sesje"
                value={agent.allowRustdesk}
                onChange={(v) => updateCaps.mutate({ allowRustdesk: v })}
              />
              <Toggle
                label="Komendy zdalne"
                hint="Pozwól na restart usług, instalację software, scan baz, etc."
                value={agent.allowRemoteCommands}
                onChange={(v) => updateCaps.mutate({ allowRemoteCommands: v })}
              />
            </div>
          )}
        </Card>

        <PartnerShareConfigBox device={d} />

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">QR kod</h3>
          <p className="text-[11px] text-tx3 mb-2">Wydrukuj i przyklej do urządzenia.</p>
          <p className="text-[11px] font-mono text-tx2">{d.qrCodeValue}</p>
        </Card>
      </div>
    </div>
  );
}

function PartnerShareConfigBox({ device: d }: { device: Device }) {
  const [shareType, setShareType] = useState<ShareResourceType | null>(null);
  return (
    <Card className="p-5">
      <h3 className="text-[14px] font-semibold text-tx mb-1 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-pri" />
        Udostępnij partnerowi
      </h3>
      <p className="text-[11px] text-tx3 mb-3 leading-relaxed">
        Wygeneruj czasowy link dla zewnętrznej firmy (np. specjalisty który pomoże naprawić).
        Po wygaśnięciu link auto-revoke. Pełen audit log dostępów.
      </p>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShareType('DEVICE')}
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--r-s)] text-[12px] font-semibold press"
          style={{ background: 'var(--pri)', color: 'white' }}
        >
          <Share2 className="h-3.5 w-3.5" />
          Pełne urządzenie (hostname, IP, OS, IDs)
        </button>
        {d.rustdeskId ? (
          <button
            type="button"
            onClick={() => setShareType('RUSTDESK_LAUNCH')}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--r-s)] text-[12px] font-semibold press border"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf)', color: 'var(--tx)' }}
          >
            <Share2 className="h-3.5 w-3.5" />
            Tylko RustDesk launch (minimalny zakres)
          </button>
        ) : (
          <p className="text-[11px] text-tx3 text-center py-2 italic">
            Ustaw RustDesk ID powyżej żeby umożliwić share „tylko RustDesk".
          </p>
        )}
      </div>
      {shareType && (
        <PartnerShareDialog
          open
          onClose={() => setShareType(null)}
          resourceType={shareType}
          resourceId={d.id}
          resourceLabel={`${d.name}${d.hostname ? ` (${d.hostname})` : ''}`}
        />
      )}
    </Card>
  );
}

// ── Security ─────────────────────────────────────────────────────────────────

function SecurityTab({ device: d, agent }: { device: Device; agent: AgentInfo | null }) {
  const sm = (agent?.serverMetrics as ServerMetricsBag | null) ?? null;
  const audit = (sm?.securityAudit as SecurityAudit | undefined) ?? null;
  const events = (sm?.securityEvents as Record<string, unknown> | undefined) ?? null;

  const { data: logs } = useQuery<{ logs: ActivityLog[] }>({
    queryKey: ['device-activity', d.id],
    queryFn: async () => (await api.get('/activity-logs', { params: { entityType: 'device', entityId: d.id, limit: 50 } })).data,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-tx">Audyt bezpieczeństwa</h3>
          <div className="flex items-center gap-2">
            {audit && typeof audit.score === 'number' && (
              <Badge variant={audit.score >= 80 ? 'success' : audit.score >= 60 ? 'warning' : 'danger'}>
                Wynik: {audit.score}/100
              </Badge>
            )}
            <ScanNowButton deviceId={d.id} agentId={agent?.id} type="run_security_audit" label="Skanuj teraz" timeoutMs={60000} />
          </div>
        </div>
        {!audit ? (
          <p className="text-[13px] text-tx3">Brak audytu. Kliknij „Skanuj teraz" aby agent natychmiast wykonał audyt — wymaga agenta v5.0.5+.</p>
        ) : (
          <div className="space-y-2">
            {(audit.checks ?? []).map((c, i) => (
              <SecurityCheckRow key={i} check={c} deviceId={d.id} agentId={agent?.id} />
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {events && Object.keys(events).length > 0 && (
          <Card className="p-5">
            <h3 className="text-[14px] font-semibold text-tx mb-3">Zdarzenia bezpieczeństwa</h3>
            <KvList items={Object.entries(events).map(([k, v]) => [k, formatValue(v)])} />
          </Card>
        )}

        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Historia zmian</h3>
          {(logs?.logs ?? []).length === 0 ? (
            <p className="text-[13px] text-tx3">Brak wpisów.</p>
          ) : (
            <div className="space-y-2">
              {(logs?.logs ?? []).slice(0, 20).map((l) => (
                <div key={l.id} className="text-[12px] border-l-2 border-bd pl-3">
                  <p className="text-tx2">{l.description ?? l.actionType}</p>
                  <p className="text-[10px] text-tx3 font-mono">{fmtDateTime(l.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SecurityCheckRow({ check: c, deviceId, agentId }: { check: SecurityCheck; deviceId: string; agentId?: string }) {
  const [open, setOpen] = useState(false);
  const isOk = c.status === 'pass' || (c.status === undefined && c.ok === true);
  const isError = c.status === 'error';
  const title = c.name ?? c.label ?? c.id ?? 'Sprawdzenie';
  const sev = c.severity;
  const sevColor =
    sev === 'critical' ? 'bg-er/15 text-er border-er/30' :
    sev === 'high'     ? 'bg-warn/15 text-warn border-warn/30' :
    sev === 'medium'   ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' :
    sev === 'low'      ? 'bg-tx3/15 text-tx3 border-tx3/30' :
    '';
  const sevLabel =
    sev === 'critical' ? 'Krytyczne' :
    sev === 'high'     ? 'Wysokie' :
    sev === 'medium'   ? 'Średnie' :
    sev === 'low'      ? 'Niskie' : '';
  const hasDetails = !!(c.description || c.why || c.fixInfo || c.detail || c.message);

  return (
    <div className={`rounded-[6px] bg-sf-h ${!isOk && !isError ? 'border-l-2 border-warn' : ''} ${isError ? 'border-l-2 border-er' : ''}`}>
      {/* DOM-valid: outer to <div role="button"> żeby nie zagnieżdżać <button> w <button> */}
      <div
        role={hasDetails ? 'button' : undefined}
        tabIndex={hasDetails ? 0 : -1}
        onClick={() => hasDetails && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!hasDetails) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={hasDetails ? open : undefined}
        className={`w-full flex items-start gap-2 p-2.5 text-left ${hasDetails ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri rounded-[6px]' : ''}`}
      >
        {isOk
          ? <CheckCircle2 className="h-4 w-4 text-ok shrink-0 mt-0.5" />
          : isError
            ? <AlertTriangle className="h-4 w-4 text-er shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] text-tx font-medium">{title}</p>
            {sev && !isOk && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevColor}`}>{sevLabel}</span>
            )}
            {c.domainManaged && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border bg-pri/10 text-pri border-pri/30"
                title="Check zarządzany przez Group Policy domeny — fix musi iść przez kontroler domeny, nie lokalnie"
              >
                🏛 GPO
              </span>
            )}
            {c.detail && (
              <span className="text-[11px] text-tx3">— {c.detail}</span>
            )}
          </div>
          {!open && c.description && (
            <p className="text-[11px] text-tx3 mt-0.5 line-clamp-1">{c.description}</p>
          )}
        </div>
        {!isOk && c.fixable && (
          <span onClick={(e) => e.stopPropagation()}>
            <FixButton deviceId={deviceId} agentId={agentId} checkId={c.id ?? ''} />
          </span>
        )}
        {hasDetails && (
          <span className="text-tx3 text-[10px] mt-1 shrink-0" aria-hidden="true">{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && hasDetails && (
        <div className="px-2.5 pb-3 pt-0 space-y-2 text-[12px]">
          {c.description && (
            <div>
              <p className="text-tx3 text-[10px] uppercase tracking-wide mb-0.5">Co to jest</p>
              <p className="text-tx2">{c.description}</p>
            </div>
          )}
          {c.why && (
            <div>
              <p className="text-tx3 text-[10px] uppercase tracking-wide mb-0.5">Wpływ na bezpieczeństwo</p>
              <p className="text-tx2">{c.why}</p>
            </div>
          )}
          {c.fixInfo && (
            <div>
              <p className="text-tx3 text-[10px] uppercase tracking-wide mb-0.5">Jak to naprawić</p>
              <p className="text-tx2">{c.fixInfo}</p>
            </div>
          )}
          {c.message && !c.detail && (
            <div>
              <p className="text-tx3 text-[10px] uppercase tracking-wide mb-0.5">Wynik</p>
              <p className="text-tx2 font-mono">{c.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FixButton({ deviceId, agentId, checkId }: { deviceId: string; agentId?: string; checkId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'gpo'; text: string } | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error('Brak agenta');
      if (!checkId) throw new Error('Brak checkId');
      return (await api.post(`/agents/admin/${agentId}/push-command`, {
        type: 'run_security_fix',
        payload: { checkId },
        timeoutMs: 90000,
      })).data;
    },
    onSuccess: (data: { ack?: { fixOk?: boolean; partial?: boolean; warning?: string; fixError?: string; output?: string; newScore?: number } }) => {
      const ack = data?.ack;
      if (ack?.fixOk && ack?.partial && ack?.warning) {
        toast(ack.warning, { icon: 'ℹ️', duration: 12000 });
        setStatus({ kind: 'gpo', text: ack.warning });
      } else if (ack?.fixOk) {
        const msg = `Naprawione${typeof ack.newScore === 'number' ? ` — nowy wynik audytu: ${ack.newScore}/100` : ''}`;
        toast.success(msg, { duration: 8000 });
        setStatus({ kind: 'ok', text: msg });
      } else {
        const detail = ack?.fixError || ack?.output || '';
        const msg = detail
          ? `Nie powiodło się: ${detail.slice(0, 250)}`
          : 'Nie powiodło się — brak szczegółów z agenta';
        toast.error(msg, { duration: 12000 });
        setStatus({ kind: 'err', text: msg });
      }
      qc.invalidateQueries({ queryKey: ['device', deviceId] });
    },
    onError: (err) => {
      const msg = extractErr(err);
      toast.error(msg, { duration: 12000 });
      setStatus({ kind: 'err', text: msg });
    },
  });
  if (status) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setStatus(null); }}
        className={`text-[11px] px-2 py-1 rounded ${
          status.kind === 'ok'  ? 'bg-ok/15 text-ok' :
          status.kind === 'gpo' ? 'bg-amber-500/15 text-amber-500' :
                                  'bg-er/15 text-er'
        }`}
        title={status.text + ' — kliknij aby powtórzyć'}
      >
        {status.kind === 'ok' ? '✓ Naprawione' : status.kind === 'gpo' ? '⚠ GPO override' : '✗ Błąd'}
      </button>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={!agentId || m.isPending}
      onClick={() => m.mutate()}
      className="text-[11px] py-1 px-2"
      title={agentId ? 'Wykonaj automatyczną naprawę' : 'Brak agenta'}
    >
      {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {m.isPending ? 'Naprawiam...' : 'Napraw'}
    </Button>
  );
}

function ScanNowButton({ deviceId, agentId, type, label, timeoutMs = 30000 }:
  { deviceId: string; agentId?: string; type: 'run_security_audit' | 'run_network_scan' | 'run_full_inventory' | 'run_server_metrics'; label: string; timeoutMs?: number }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error('Brak agenta');
      return (await api.post(`/agents/admin/${agentId}/push-command`, { type, timeoutMs })).data;
    },
    onSuccess: () => {
      toast.success(`${label}: ukończone — odświeżam`);
      qc.invalidateQueries({ queryKey: ['device', deviceId] });
    },
    onError: (err) => toast.error(extractErr(err)),
  });
  return (
    <Button
      variant="outline"
      className="text-[11px] py-1 px-2"
      disabled={!agentId || m.isPending}
      onClick={() => m.mutate()}
      title={agentId ? `Wymuś ${label}` : 'Brak agenta'}
    >
      {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      {label}
    </Button>
  );
}

// ── Tickets ──────────────────────────────────────────────────────────────────

function TicketsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useQuery<{ items?: TicketSummary[]; tickets?: TicketSummary[] }>({
    queryKey: ['device-tickets', deviceId],
    queryFn: async () => (await api.get('/tickets', { params: { deviceId, limit: 50 } })).data,
  });
  const tickets: TicketSummary[] = data?.items ?? data?.tickets ?? [];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-bd flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-tx">Zgłoszenia ({tickets.length})</h3>
        <Link to={`/tickets/new?deviceId=${deviceId}`}>
          <Button variant="outline" className="text-[12px]"><Plus className="h-3.5 w-3.5" /> Nowe</Button>
        </Link>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-tx3"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : tickets.length === 0 ? (
        <div className="py-10 text-center text-tx3 text-[13px]">Brak zgłoszeń.</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <tr>
              <th className="px-4 py-2.5">Numer</th>
              <th className="px-4 py-2.5">Tytuł</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Priorytet</th>
              <th className="px-4 py-2.5">Utworzono</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-sf-h cursor-pointer">
                <td className="px-4 py-3 font-mono text-[11px]">
                  <Link to={`/tickets/${t.id}`} className="text-pri hover:underline">{t.ticketNumber ?? t.number}</Link>
                </td>
                <td className="px-4 py-3 text-tx">{t.title}</td>
                <td className="px-4 py-3"><Badge variant="neutral">{t.status}</Badge></td>
                <td className="px-4 py-3"><PriorityDot priority={t.priority} withLabel /></td>
                <td className="px-4 py-3 text-tx3 text-[11px]">{fmtDateTime(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ── Backups ──────────────────────────────────────────────────────────────────

function BackupsTab({ device: d, agent }: { device: Device; agent: AgentInfo | null }) {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isLoading } = useQuery<{ configs: BackupConfig[] }>({
    queryKey: ['device-backups', d.id, agent?.id ?? null],
    queryFn: async () => (await api.get('/backups', {
      params: { deviceId: d.id, ...(agent?.id ? { agentRegistrationId: agent.id } : {}) },
    })).data,
  });
  const configs = data?.configs ?? [];

  const runNow = useMutation({
    mutationFn: async (id: string) => (await api.post(`/backups/${id}/run-now`)).data,
    onSuccess: () => {
      toast.success('Backup zakolejkowany');
      qc.invalidateQueries({ queryKey: ['device-backups', d.id] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Nie udało się uruchomić backupu'),
  });

  return (
    <div className="space-y-4">
      {!agent && (
        <Card className="p-3 text-[12px] text-tx3">
          Brak agenta — backupy zdefiniowane przez agenta są niedostępne.
          Pokazane są tylko backupy przypisane bezpośrednio do urządzenia.
        </Card>
      )}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-bd flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-tx">Konfiguracje kopii ({configs.length})</h3>
          <Button variant="outline" className="text-[12px]" onClick={() => setWizardOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nowa
          </Button>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-tx3"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : configs.length === 0 ? (
          <div className="py-10 text-center text-tx3 text-[13px]">Brak skonfigurowanych kopii.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              <tr>
                <th className="px-4 py-2.5">Nazwa</th>
                <th className="px-4 py-2.5">Typ</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5">Ostatni</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {configs.map((c) => (
                <tr key={c.id} className="hover:bg-sf-h">
                  <td className="px-4 py-3 text-tx font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-tx2">{c.type}</td>
                  <td className="px-4 py-3 text-tx3 font-mono text-[11px]">{c.cronSchedule}</td>
                  <td className="px-4 py-3 text-tx3 text-[11px]">{fmtDateTime(c.lastRunAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.lastStatus === 'SUCCESS' ? 'success' : c.lastStatus === 'FAILED' ? 'danger' : 'neutral'}>
                      {c.lastStatus ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      className="text-[11px] py-1 px-2"
                      onClick={() => runNow.mutate(c.id)}
                      disabled={runNow.isPending}
                    >
                      {runNow.isPending && runNow.variables === c.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <PlayCircle className="h-3.5 w-3.5" />} Uruchom
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <BackupWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          qc.invalidateQueries({ queryKey: ['device-backups', d.id] });
        }}
      />
    </div>
  );
}

// ── Network ──────────────────────────────────────────────────────────────────

function NetworkTab({ device: d, agent }: { device: Device; agent: AgentInfo | null }) {
  const sm = (agent?.serverMetrics as ServerMetricsBag | null) ?? null;
  const ifaces = Array.isArray(sm?.networkIfaces) ? sm!.networkIfaces : [];
  const scan = (sm?.networkScan ?? sm?.networkScanDiff) as NetworkScan | undefined;
  const speedtest = sm?.speedtest as SpeedtestResult | undefined;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-tx">Interfejsy ({ifaces.length})</h3>
          <ScanNowButton deviceId={d.id} agentId={agent?.id} type="run_full_inventory" label="Odśwież" timeoutMs={30000} />
        </div>
        {ifaces.length === 0 ? (
          <p className="text-[13px] text-tx3">Brak danych. {agent ? 'Czekam na agenta.' : 'Brak agenta.'}</p>
        ) : (
          <div className="space-y-2">
            {ifaces.map((i, idx) => (
              <div key={idx} className="flex items-center gap-3 text-[12px] p-2 bg-sf-h rounded-[6px]">
                <span className="text-tx font-medium min-w-[140px]">{i.name ?? '—'}</span>
                <span className="text-tx3 font-mono">{i.ip ?? '—'}</span>
                <span className="text-tx3 font-mono text-[11px]">{i.mac ?? '—'}</span>
                {i.isUp != null && <Badge variant={i.isUp ? 'success' : 'neutral'}>{i.isUp ? 'UP' : 'DOWN'}</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {speedtest && (
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Speedtest</h3>
          <KvList items={[
            ['Download', speedtest.download != null ? `${speedtest.download} Mbps` : '—'],
            ['Upload',   speedtest.upload   != null ? `${speedtest.upload} Mbps`   : '—'],
            ['Ping',     speedtest.ping     != null ? `${speedtest.ping} ms`       : '—'],
            ['Serwer',   speedtest.server ?? '—'],
          ]} />
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-tx">LAN scan</h3>
          <ScanNowButton deviceId={d.id} agentId={agent?.id} type="run_network_scan" label="Skanuj sieć" timeoutMs={120000} />
        </div>
        {!scan ? (
          <p className="text-[13px] text-tx3">Brak skanu sieci. Kliknij „Skanuj sieć" — może potrwać do 2 minut.</p>
        ) : (
          <p className="text-[13px] text-tx2">
            Subnet: <span className="font-mono">{scan.subnet ?? '—'}</span> ·
            Urządzenia: {Array.isArray(scan.devices) ? scan.devices.length : '—'}
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function SessionsTab({ device: d }: { device: Device }) {
  const { data } = useQuery<{ sessions: WorkSession[] }>({
    queryKey: ['device-sessions', d.id],
    queryFn: async () => (await api.get('/sessions', { params: { deviceId: d.id, limit: 50 } })).data,
  });
  const sessions = data?.sessions ?? [];

  const launchers = useMemo(() => {
    // Wszystkie metody zdalnego dostępu jako klikalne deeplinki (rustdesk://, anydesk:, teamviewer8://, rdp://, ssh://, custom).
    const list: { kind: 'rustdesk' | 'anydesk' | 'teamviewer' | 'rdp' | 'ssh' | 'custom'; value: string }[] = [];
    if (d.rustdeskId)       list.push({ kind: 'rustdesk',   value: d.rustdeskId });
    if (d.anydeskId)        list.push({ kind: 'anydesk',    value: d.anydeskId });
    if (d.teamviewerId)     list.push({ kind: 'teamviewer', value: d.teamviewerId });
    if (d.rdpAddress)       list.push({ kind: 'rdp',        value: d.rdpAddress });
    if (d.sshAddress)       list.push({ kind: 'ssh',        value: d.sshAddress });
    if (d.customRemoteLink) list.push({ kind: 'custom',     value: d.customRemoteLink });
    return list;
  }, [d]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-bd">
            <h3 className="text-[14px] font-semibold text-tx">Historia sesji ({sessions.length})</h3>
          </div>
          {sessions.length === 0 ? (
            <div className="py-10 text-center text-tx3 text-[13px]">Brak sesji serwisowych.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
                <tr>
                  <th className="px-4 py-2.5">Start</th>
                  <th className="px-4 py-2.5">Koniec</th>
                  <th className="px-4 py-2.5">Czas</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-sf-h">
                    <td className="px-4 py-3 text-tx2 text-[11px]">{fmtDateTime(s.startedAt)}</td>
                    <td className="px-4 py-3 text-tx3 text-[11px]">{fmtDateTime(s.endedAt)}</td>
                    <td className="px-4 py-3 text-tx2">{s.billableMinutes ?? s.durationMinutes ?? '—'} min</td>
                    <td className="px-4 py-3"><Badge variant="neutral">{s.status ?? '—'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <Card className="p-5">
          <h3 className="text-[14px] font-semibold text-tx mb-3">Zdalny dostęp</h3>
          {launchers.length === 0 ? (
            <p className="text-[13px] text-tx3">Brak skonfigurowanych kanałów. Dodaj w Konfiguracji.</p>
          ) : (
            <div className="space-y-2">
              {launchers.map((l) => (
                <div key={l.kind} className="flex items-center gap-2 flex-wrap">
                  <RemoteLaunchLink kind={l.kind} value={l.value} size="md" showValue />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Vault ────────────────────────────────────────────────────────────────────

function VaultTab({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ credentials: Credential[] }>({
    queryKey: ['device-credentials', deviceId],
    queryFn: async () => (await api.get('/vault', { params: { deviceId } })).data,
  });
  const creds = data?.credentials ?? [];
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [showAdd, setShowAdd] = useState(false);

  const reveal = useMutation({
    mutationFn: async (id: string) => (await api.post(`/vault/${id}/reveal`, {})).data,
    onSuccess: (resp, id) => {
      setRevealed((r) => ({ ...r, [id]: { username: resp.username ?? '', password: resp.password ?? '' } }));
    },
    onError: (err) => toast.error(extractErr(err)),
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vault/${id}`)).data,
    onSuccess: () => { toast.success('Usunięto'); qc.invalidateQueries({ queryKey: ['device-credentials', deviceId] }); },
    onError: (err) => toast.error(extractErr(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-bd flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-tx">Sejf haseł ({creds.length})</h3>
        <Button variant="outline" className="text-[12px]" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Dodaj
        </Button>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-tx3"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : creds.length === 0 ? (
        <div className="py-10 text-center text-tx3 text-[13px]">Brak haseł. Dodaj pierwsze hasło dla tego urządzenia.</div>
      ) : (
        <div className="divide-y divide-bd">
          {creds.map((c) => {
            const r = revealed[c.id];
            return (
              <div key={c.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-3">
                  <p className="text-[13px] text-tx font-medium">{c.name}</p>
                  <p className="text-[11px] text-tx3">{c.category}</p>
                </div>
                <div className="col-span-3 text-[12px] font-mono text-tx2">{c.username ?? '—'}</div>
                <div className="col-span-4 text-[12px] font-mono text-tx2 truncate">
                  {r ? r.password : '••••••••••••'}
                </div>
                <div className="col-span-2 flex justify-end gap-1">
                  {r ? (
                    <button onClick={() => setRevealed((x) => { const c2 = { ...x }; delete c2[c.id]; return c2; })}
                      className="p-1.5 text-tx3 hover:text-tx press"><EyeOff className="h-3.5 w-3.5" /></button>
                  ) : (
                    <button onClick={() => reveal.mutate(c.id)} disabled={reveal.isPending}
                      className="p-1.5 text-tx3 hover:text-pri press"><Eye className="h-3.5 w-3.5" /></button>
                  )}
                  <button onClick={() => { if (confirm(`Usunąć "${c.name}"?`)) del.mutate(c.id); }}
                    className="p-1.5 text-tx3 hover:text-er press"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showAdd && <AddCredentialDialog deviceId={deviceId} onClose={() => setShowAdd(false)} />}
    </Card>
  );
}

interface ParsedCredential {
  name: string;
  category: string;
  username: string;
  password: string;
  urlOrHost: string;
  selected: boolean;
}

function detectCategory(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('mail') || u.includes('gmail') || u.includes('outlook') || u.includes('imap')) return 'EMAIL';
  if (u.includes('vpn') || u.includes('openvpn') || u.includes('wireguard')) return 'VPN';
  if (u.includes('router') || u.includes('192.168.') || u.includes('10.0.') || u.includes('mikrotik')) return 'ROUTER';
  if (u.includes('ssh://') || u.includes(':22')) return 'SSH';
  if (u.includes('database') || u.includes('mysql') || u.includes('postgres') || u.includes(':5432') || u.includes(':3306')) return 'DATABASE';
  if (u.includes('wifi') || u.includes('wlan')) return 'WIFI';
  return 'APPLICATION';
}

function parseCsv(text: string): ParsedCredential[] {
  // Chrome/Edge format: name,url,username,password,note
  // Firefox format: "url","username","password","httpRealm","formActionOrigin","guid",...
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  function parseRow(row: string): string[] {
    const out: string[] = [];
    let i = 0, cur = '', inQ = false;
    while (i < row.length) {
      const c = row[i];
      if (inQ) {
        if (c === '"' && row[i + 1] === '"') { cur += '"'; i += 2; continue; }
        if (c === '"') { inQ = false; i++; continue; }
        cur += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { out.push(cur); cur = ''; i++; continue; }
      cur += c; i++;
    }
    out.push(cur);
    return out;
  }

  const header = parseRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idxName = header.indexOf('name');
  const idxUrl = header.findIndex((h) => h === 'url' || h === 'origin');
  const idxUser = header.findIndex((h) => h === 'username' || h === 'login' || h === 'user');
  const idxPass = header.findIndex((h) => h === 'password');

  if (idxPass === -1) return [];

  const items: ParsedCredential[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    const url = idxUrl >= 0 ? cols[idxUrl] ?? '' : '';
    const password = cols[idxPass] ?? '';
    if (!password) continue;
    const username = idxUser >= 0 ? cols[idxUser] ?? '' : '';
    let name = idxName >= 0 ? cols[idxName] ?? '' : '';
    if (!name) {
      try {
        name = url ? new URL(url).hostname.replace(/^www\./, '') : (username || 'Bez nazwy');
      } catch { name = url || username || 'Bez nazwy'; }
    }
    items.push({
      name: name.slice(0, 200),
      category: detectCategory(url),
      username,
      password,
      urlOrHost: url,
      selected: true,
    });
  }
  return items;
}

function ImportCsvDialog({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [parsed, setParsed] = useState<ParsedCredential[] | null>(null);
  const [filename, setFilename] = useState<string>('');

  const importMut = useMutation({
    mutationFn: async () => {
      const items = (parsed ?? []).filter((p) => p.selected).map((p) => ({
        name: p.name,
        category: p.category,
        username: p.username || undefined,
        password: p.password,
        urlOrHost: p.urlOrHost || undefined,
        deviceId,
      }));
      return (await api.post<{ imported: number; total: number; failures: Array<{ name: string; reason: string }> }>('/vault/bulk-import', { items, defaultDeviceId: deviceId })).data;
    },
    onSuccess: (data) => {
      toast.success(`Zaimportowano ${data.imported} z ${data.total} haseł`);
      if (data.failures.length > 0) {
        const summary = data.failures.slice(0, 3).map((f: { line?: number; reason?: string }) => `linia ${f.line ?? '?'}: ${f.reason ?? 'błąd'}`).join('; ');
        const more = data.failures.length > 3 ? ` (+${data.failures.length - 3} kolejnych)` : '';
        toast.error(`${data.failures.length} pominiętych — ${summary}${more}`, { duration: 8000 });
      }
      qc.invalidateQueries({ queryKey: ['device-credentials', deviceId] });
      onClose();
    },
    onError: (err) => toast.error(extractErr(err)),
  });

  function handleFile(file: File) {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const items = parseCsv(String(reader.result ?? ''));
      if (items.length === 0) {
        toast.error('Plik pusty albo nieobsługiwany format. Oczekiwane: Chrome / Edge / Firefox CSV export.');
        return;
      }
      setParsed(items);
    };
    reader.readAsText(file);
  }

  const selectedCount = (parsed ?? []).filter((p) => p.selected).length;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-[720px] max-h-[92vh] rounded-[var(--r-xl)] anim-scale overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[15px] font-bold text-tx flex items-center gap-2">
              <Download className="h-4 w-4 text-pri" />
              Importuj hasła z przeglądarki (CSV)
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
                <span className="sr-only">Zamknij</span>
              </button>
            </Dialog.Close>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
            {!parsed ? (
              <>
                <div
                  className="rounded-[var(--r-s)] border-2 border-dashed p-6 text-center"
                  style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
                >
                  <Download className="h-8 w-8 mx-auto mb-2 text-tx3" />
                  <p className="text-[13px] text-tx mb-2">Wybierz plik CSV z eksportu przeglądarki</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="text-[12px]"
                  />
                </div>
                <div className="text-[11px] text-tx3 leading-relaxed mt-4 space-y-2">
                  <p><strong className="text-tx2">Jak wyeksportować z Chrome / Edge / Brave:</strong></p>
                  <p>1. Otwórz <code className="font-mono">chrome://password-manager/passwords</code></p>
                  <p>2. Ikona ustawień (koło zębate) → „Wyeksportuj hasła"</p>
                  <p>3. Potwierdź hasłem Windows → wybierz miejsce zapisu CSV</p>
                  <p className="pt-2"><strong className="text-tx2">Firefox:</strong></p>
                  <p>1. <code className="font-mono">about:logins</code> → menu „..." → „Eksportuj hasła"</p>
                  <p className="pt-2 text-wn">⚠ Plik CSV zawiera plaintext hasła — usuń go po imporcie!</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] text-tx2">
                    Plik <strong>{filename}</strong> · {parsed.length} haseł · {selectedCount} zaznaczonych do importu
                  </p>
                  <button
                    type="button"
                    onClick={() => setParsed(parsed.map((p) => ({ ...p, selected: true })))}
                    className="text-[11px] text-pri hover:underline press"
                  >
                    Zaznacz wszystkie
                  </button>
                </div>
                <div className="rounded-[var(--r-s)] border overflow-hidden" style={{ borderColor: 'var(--bd)' }}>
                  <table className="w-full text-[12px]">
                    <thead className="bg-sf-h text-left text-[10px] uppercase tracking-wider text-tx3">
                      <tr>
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2">Nazwa</th>
                        <th className="px-3 py-2">Kategoria</th>
                        <th className="px-3 py-2">Login</th>
                        <th className="px-3 py-2">URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bd">
                      {parsed.map((p, i) => (
                        <tr key={i} className="hover:bg-sf-h">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={p.selected}
                              onChange={(e) => {
                                const next = [...parsed];
                                next[i] = { ...p, selected: e.target.checked };
                                setParsed(next);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-tx font-medium truncate max-w-[180px]">{p.name}</td>
                          <td className="px-3 py-2 text-tx2">
                            <select
                              value={p.category}
                              onChange={(e) => {
                                const next = [...parsed];
                                next[i] = { ...p, category: e.target.value };
                                setParsed(next);
                              }}
                              className="bg-transparent border-none text-[11px] text-tx2"
                            >
                              {['WINDOWS', 'VPN', 'EMAIL', 'APPLICATION', 'DATABASE', 'ROUTER', 'WIFI', 'SSH', 'API_KEY', 'CERTIFICATE', 'OTHER'].map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-tx3 font-mono truncate max-w-[120px]">{p.username || '—'}</td>
                          <td className="px-3 py-2 text-tx3 truncate max-w-[200px]" title={p.urlOrHost}>{p.urlOrHost || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            {parsed && (
              <Button
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending || selectedCount === 0}
              >
                {importMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Download className="h-4 w-4" /> Importuj {selectedCount}</>}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddCredentialDialog({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showCsv, setShowCsv] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'WINDOWS', username: '', password: '', urlOrHost: '', notes: '' });
  const create = useMutation({
    mutationFn: async () => (await api.post('/vault', { ...form, deviceId })).data,
    onSuccess: () => { toast.success('Dodano hasło'); qc.invalidateQueries({ queryKey: ['device-credentials', deviceId] }); onClose(); },
    onError: (err) => toast.error(extractErr(err)),
  });

  if (showCsv) {
    return <ImportCsvDialog deviceId={deviceId} onClose={onClose} />;
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md max-h-[92vh] rounded-[var(--r-xl)] anim-scale overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[15px] font-bold text-tx">Nowe hasło</Dialog.Title>
            <button
              type="button"
              onClick={() => setShowCsv(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold press text-pri hover:underline"
              title="Importuj wiele haseł z pliku CSV przeglądarki"
            >
              <Download className="h-3.5 w-3.5" />
              Importuj CSV
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-3">
            <Field label="Nazwa" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <FieldSelect label="Kategoria" value={form.category} onChange={(v) => setForm({ ...form, category: v })}
              options={['WINDOWS', 'VPN', 'EMAIL', 'APPLICATION', 'DATABASE', 'ROUTER', 'WIFI', 'SSH', 'API_KEY', 'CERTIFICATE', 'OTHER'].map((v) => ({ value: v, label: v }))} />
            <Field label="Login" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
            <Field label="Hasło" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            <Field label="URL / Host" value={form.urlOrHost} onChange={(v) => setForm({ ...form, urlOrHost: v })} />
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h shrink-0">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name || !form.password}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dodaj'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

function ActionsTab({ device: _d, agent, isOnline }: { device: Device; agent: AgentInfo | null; isOnline: boolean }) {
  const agentId = agent?.id;
  const [ackResult, setAckResult] = useState<{ title: string; data: unknown } | null>(null);

  const push = useMutation({
    mutationFn: async (body: { type: string; payload?: Record<string, unknown>; label?: string }) => {
      if (!agentId) throw new Error('Brak agenta');
      const { label: _l, ...sendBody } = body;
      const resp = (await api.post(`/agents/admin/${agentId}/push-command`, sendBody)).data;
      return { resp, label: body.label ?? body.type };
    },
    onSuccess: ({ resp, label }) => {
      if (resp?.ack && Object.keys(resp.ack).length > 0) {
        setAckResult({ title: label, data: resp.ack });
      } else {
        toast.success(`${label}: wysłano`);
      }
    },
    onError: (err) => toast.error(extractErr(err)),
  });

  const wake = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error('Brak agenta');
      return (await api.post(`/agents/admin/${agentId}/wake`, {})).data;
    },
    onSuccess: () => toast.success('WoL wysłany przez relay'),
    onError: (err) => toast.error(extractErr(err)),
  });

  const speedtest = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error('Brak agenta');
      return (await api.post(`/agents/admin/${agentId}/run-speedtest`, {})).data;
    },
    onSuccess: (data) => {
      const r = data?.result ?? {};
      const dl = r.download_mbps, up = r.upload_mbps, ping = r.ping_ms;
      if (dl == null && up == null && ping == null) {
        toast.error('Agent nie zwrócił wyników (może brak speedtest CLI)');
      } else {
        toast.success(`↓${dl ?? '?'} Mbps · ↑${up ?? '?'} Mbps · ${ping ?? '?'} ms`);
      }
    },
    onError: (err) => toast.error(extractErr(err)),
  });

  function confirmAction(label: string, fn: () => void) {
    if (confirm(`Wykonać "${label}"?`)) fn();
  }

  if (!agent) {
    return <Card className="p-8 text-center text-tx3 text-[13px]">Brak agenta — akcje niedostępne.</Card>;
  }
  if (!agent.allowRemoteCommands) {
    return (
      <Card className="p-8 text-center">
        <Shield className="h-6 w-6 mx-auto mb-2 text-warn" />
        <p className="text-tx font-medium">Komendy zdalne wyłączone</p>
        <p className="text-[13px] text-tx3 mt-1">Włącz w zakładce "Konfiguracja" → "Uprawnienia agenta".</p>
      </Card>
    );
  }
  const offlineHint = !isOnline ? <p className="text-[11px] text-warn mt-2">Agent offline — komenda zostanie wykonana po połączeniu.</p> : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold text-tx mb-3">Zarządzanie systemem</h3>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn icon={Power} label="Restart Windows" tone="danger"
            onClick={() => confirmAction('restart Windows (60s ostrzeżenie)', () => push.mutate({ type: 'system_reboot', payload: { delay: 60 } }))} />
          <ActionBtn icon={RefreshCw} label="Aktualizacje Windows"
            onClick={() => confirmAction('uruchomić Windows Update', () => push.mutate({ type: 'windows_update' }))} />
          <ActionBtn icon={Download} label="Aktualizuj agenta"
            onClick={() => push.mutate({ type: 'update' })} />
          <ActionBtn icon={Zap} label="Wake-on-LAN"
            onClick={() => wake.mutate()} />
        </div>
        {offlineHint}
      </Card>

      <Card className="p-5">
        <h3 className="text-[14px] font-semibold text-tx mb-3">Diagnostyka</h3>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn icon={Activity} label="Speedtest"
            onClick={() => speedtest.mutate()} />
          <ActionBtn icon={Database} label="Skanuj bazy danych"
            onClick={() => push.mutate({ type: 'scan_databases', label: 'Skan baz danych' })} />
        </div>
        <p className="text-[11px] text-tx3 mt-3">
          „Test połączenia DB" wymaga loginu/hasła — użyj formularza w nowym ticketcie albo zakładce Sejf haseł.<br/>
          „Uruchom backup" — przejdź do zakładki <strong>Kopie</strong> i kliknij „Uruchom" przy wybranej konfiguracji.
        </p>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <h3 className="text-[14px] font-semibold text-tx mb-3">Instalacja oprogramowania</h3>
        <InstallSoftwareForm onSubmit={(pkg) => push.mutate({ type: 'install_software', payload: { package: pkg }, label: `Instalacja ${pkg}` })} />
      </Card>

      <Card className="p-5 lg:col-span-2">
        <h3 className="text-[14px] font-semibold text-tx mb-3">Restart usługi</h3>
        <RestartServiceForm onSubmit={(svc) => push.mutate({ type: 'restart_service', payload: { serviceName: svc }, label: `Restart ${svc}` })} />
      </Card>

      {ackResult && <AckResultDialog title={ackResult.title} data={ackResult.data} onClose={() => setAckResult(null)} />}
    </div>
  );
}

function AckResultDialog({ title, data, onClose }: { title: string; data: unknown; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 anim-up" onClick={onClose}>
      <div className="w-full max-w-2xl anim-scale" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-tx">Wynik: {title}</h3>
            <Button variant="ghost" onClick={onClose}>Zamknij</Button>
          </div>
          <pre className="text-[11px] font-mono bg-sf-h p-3 rounded-[var(--r-s)] overflow-auto max-h-[60vh] text-tx2">
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );
}

function InstallSoftwareForm({ onSubmit }: { onSubmit: (pkg: string) => void }) {
  const [pkg, setPkg] = useState('');
  return (
    <div className="flex gap-2">
      <Input placeholder="winget id, np. 7zip.7zip" value={pkg} onChange={(e) => setPkg(e.target.value)} />
      <Button disabled={!pkg.trim()} onClick={() => { onSubmit(pkg.trim()); setPkg(''); }}>Zainstaluj</Button>
    </div>
  );
}

function RestartServiceForm({ onSubmit }: { onSubmit: (svc: string) => void }) {
  const [svc, setSvc] = useState('');
  return (
    <div className="flex gap-2">
      <Input placeholder="np. Spooler" value={svc} onChange={(e) => setSvc(e.target.value)} />
      <Button disabled={!svc.trim()} onClick={() => { onSubmit(svc.trim()); setSvc(''); }}>Restart</Button>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'er' | 'neutral' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'er' ? 'var(--er)' : 'var(--tx)';
  return (
    <Card className="p-4">
      <p className="text-[10px] uppercase tracking-[0.1em] text-tx3 mb-1">{label}</p>
      <p className="text-[20px] font-bold" style={{ color }}>{value}</p>
    </Card>
  );
}

function ActionBtn({ icon: Icon, label, onClick, tone }: { icon: typeof Activity; label: string; onClick: () => void; tone?: 'danger' }) {
  return (
    <button type="button" onClick={onClick}
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-[6px] text-[12px] font-medium press border',
        tone === 'danger' ? 'border-er/30 text-er hover:bg-er/10' : 'border-bd text-tx hover:bg-sf-h',
      ].join(' ')}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function KvList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="space-y-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-3 text-[13px]">
          <dt className="text-tx3 w-[140px] shrink-0">{k}</dt>
          <dd className="text-tx2 flex-1 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  // Pola hasła w credential dialogu nie powinny trafiać do password managerów —
  // to są cudze hasła klienta, nie hasło logowania usera.
  const sensitiveProps = type === 'password'
    ? { autoComplete: 'off', 'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-bwignore': 'true' }
    : {};
  return (
    <div>
      <label className="block text-[10px] font-semibold text-tx3 mb-1">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...sensitiveProps} />
    </div>
  );
}

type RemoteKind = 'rustdesk' | 'anydesk' | 'teamviewer' | 'rdp' | 'ssh' | 'custom';

function buildRemoteUrl(kind: RemoteKind, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (kind) {
    case 'rustdesk':   return `rustdesk://connection/new/${encodeURIComponent(v)}`;
    case 'anydesk':    return `anydesk:${encodeURIComponent(v)}`;
    case 'teamviewer': return `teamviewer8://control?device=${encodeURIComponent(v)}`;
    case 'rdp':        return `rdp://${v.replace(/^rdp:\/\//, '')}`;
    case 'ssh':        return `ssh://${v.replace(/^ssh:\/\//, '')}`;
    case 'custom':     return /^https?:\/\//i.test(v) ? v : null;
  }
}

function ConnectField({ label, value, onChange, kind }: { label: string; value: string; onChange: (v: string) => void; kind: RemoteKind }) {
  const url = buildRemoteUrl(kind, value);
  const v = value.trim();

  function connect() {
    if (!url) return;
    // Deep links (rustdesk://, anydesk:, teamviewer8://) — odpalamy przez ukryty link.
    // window.open dla custom URL-a w nowej karcie.
    if (kind === 'custom') {
      window.open(url, '_blank', 'noopener');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function copy() {
    navigator.clipboard.writeText(v).then(
      () => toast.success('Skopiowano'),
      () => toast.error('Nie udało się skopiować'),
    );
  }

  return (
    <div>
      <label className="block text-[10px] font-semibold text-tx3 mb-1">{label}</label>
      <div className="flex gap-1.5">
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
        {v && (
          <>
            <button
              type="button"
              onClick={connect}
              disabled={!url}
              title={url ? 'Połącz' : 'Brak handlera (wpisz pełny adres)'}
              className="shrink-0 px-3 rounded-[var(--r-s)] text-[12px] font-medium bg-pri text-white hover:bg-pri/90 disabled:opacity-40 disabled:cursor-not-allowed press"
            >
              Połącz
            </button>
            <button
              type="button"
              onClick={copy}
              title="Kopiuj"
              className="shrink-0 px-2 rounded-[var(--r-s)] text-tx3 border border-bd hover:bg-sf-h press"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-tx3 mb-1">{label}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-tx3 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="w-full px-3 py-2 text-[13px] rounded-[var(--r-s)] bg-sf border border-bd text-tx focus:outline-none focus:border-pri" />
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-tx font-medium">{label}</p>
        {hint && <p className="text-[11px] text-tx3 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}

function pctTone(v: number | null, inverted = false): 'ok' | 'warn' | 'er' | 'neutral' {
  if (v == null) return 'neutral';
  // inverted=true (e.g. dysk used%) — wysokie = źle. Domyślnie też wysokie = źle (CPU/RAM).
  void inverted;
  if (v >= 90) return 'er';
  if (v >= 75) return 'warn';
  return 'ok';
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pl-PL'); } catch { return s; }
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pl-PL'); } catch { return s; }
}

function formatRelative(s: string): string {
  try {
    const diff = Date.now() - new Date(s).getTime();
    if (diff < 60_000) return 'przed chwilą';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min temu`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h temu`;
    return new Date(s).toLocaleDateString('pl-PL');
  } catch { return s; }
}

function joinNN(...parts: (string | null | undefined)[]): string {
  const out = parts.filter(Boolean).join(' ');
  return out || '—';
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function extractErr(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? 'Błąd';
}

// ── Sub-types ────────────────────────────────────────────────────────────────

interface ServerMetricsBag {
  cpuUsage?: number;
  ramUsage?: number;
  networkIfaces?: NetworkInterface[];
  networkScan?: NetworkScan;
  networkScanDiff?: NetworkScan;
  speedtest?: SpeedtestResult;
  securityAudit?: SecurityAudit;
  securityEvents?: Record<string, unknown>;
}

interface NetworkInterface { name?: string; ip?: string; mac?: string; isUp?: boolean; up?: boolean }
interface NetworkScan { subnet?: string; devices?: unknown[] }
interface SpeedtestResult { download?: number; upload?: number; ping?: number; server?: string }
interface SecurityAudit { score?: number; checks?: SecurityCheck[] }
interface SecurityCheck {
  id?: string;
  label?: string;
  name?: string;          // human-readable name z agenta v5+
  message?: string;
  ok?: boolean;
  status?: 'pass' | 'fail' | 'error';  // agent v5 wysyła status zamiast ok
  severity?: 'critical' | 'high' | 'medium' | 'low';
  detail?: string;        // konkretny wynik np. "Wylaczone" / "3 dni temu"
  description?: string;   // co to jest (z SECURITY_CHECK_INFO.desc)
  why?: string;           // wpływ na bezpieczeństwo (impact)
  fixInfo?: string;       // jak to naprawić
  fixable?: boolean;
  domainManaged?: boolean;  // Check zarządzany przez GPO domeny — fix lokalny nie działa
}

interface TicketSummary { id: string; ticketNumber?: string; number?: string; title: string; status: string; priority: string; createdAt: string }
interface BackupConfig { id: string; name: string; type: string; cronSchedule: string; lastStatus: string | null; lastRunAt: string | null }
interface WorkSession { id: string; startedAt: string; endedAt: string | null; durationMinutes: number | null; billableMinutes: number | null; status: string | null }
interface Credential { id: string; name: string; category: string; username: string | null; urlOrHost: string | null }
interface ActivityLog { id: string; actionType: string; description: string | null; createdAt: string }

export default DeviceDetailPage;
