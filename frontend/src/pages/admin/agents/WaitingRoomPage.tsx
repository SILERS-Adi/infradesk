import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Monitor, Check, Trash2, Wifi, WifiOff, Clock, ChevronDown, ChevronUp, Cpu, HardDrive, Network, Package, RefreshCw, Search, ExternalLink } from 'lucide-react';
import { agentsApi, AgentRegistration, InstalledSoftware, DiskInfo, NetworkIface } from '../../../api/agents';
import { devicesApi } from '../../../api/devices';
import { apiClient } from '../../../api/client';
import { MspCompanyFilter } from '../../../components/ui/MspCompanyFilter';
import { Button } from '../../../components/ui/Button';
import { getErrorMessage } from '../../../utils/helpers';
import { clsx } from 'clsx';
import { useWorkspace } from '../../../store/workspaceStore';

/* ── helper: dark glass card ─────────────────────────────── */
const glass = 'rounded-xl border' as const;
const glassStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderColor: 'var(--border)',
};

/* ── MetricBar ───────────────────────────────────────────── */
function MetricBar({ value, label }: { value?: number; label: string }) {
  if (value == null) return null;
  const pct = Math.round(value);
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ts)' }}>
      <span className="w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-medium">{pct}%</span>
    </div>
  );
}

/* ── InfoRow ─────────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-28 shrink-0" style={{ color: 'var(--tm)' }}>{label}</span>
      <span className="font-medium break-all" style={{ color: 'var(--t)' }}>{value}</span>
    </div>
  );
}

/* ── Version Badge ───────────────────────────────────────── */
function VersionBadge({ appVersion, latestVersion }: { appVersion?: string | null; latestVersion?: string }) {
  if (!appVersion) {
    return (
      <span
        className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 border"
        style={{ background: 'var(--hover-bg)', borderColor: 'var(--border)', color: 'var(--tm)' }}
      >
        Brak wersji
      </span>
    );
  }
  const isCurrent = !latestVersion || appVersion === latestVersion;
  if (isCurrent) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
        style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)', color: '#4ADE80' }}
      >
        v{appVersion} &#10003;
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
      style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.25)', color: '#F87171' }}
    >
      v{appVersion} &#10007; (akt. {latestVersion})
    </span>
  );
}

/* ── AgentRow ────────────────────────────────────────────── */
function AgentRow({ reg, latestVersion, onApprove, onQuickApprove, onDelete }: {
  reg: AgentRegistration;
  latestVersion?: string;
  onApprove: (reg: AgentRegistration) => void;
  onQuickApprove: (reg: AgentRegistration) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showWinUpdate, setShowWinUpdate] = useState(false);
  const [winUpdateMode, setWinUpdateMode] = useState<'reboot' | 'schedule'>('reboot');
  const [winUpdateTime, setWinUpdateTime] = useState('02:00');

  const qc = useQueryClient();
  const [updateSent, setUpdateSent] = useState(false);

  const pushUpdateMutation = useMutation({
    mutationFn: () => agentsApi.pushUpdate(reg.id),
    onSuccess: () => {
      setUpdateSent(true);
      toast.success('Komenda aktualizacji wysłana — asystent restartuje się za chwilę');
      // Po 30s odśwież listę żeby zobaczyć nową wersję
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['agents'] });
        setUpdateSent(false);
      }, 30_000);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const winUpdateMutation = useMutation({
    mutationFn: () => agentsApi.windowsUpdate(reg.id, winUpdateMode === 'schedule' ? winUpdateTime : undefined),
    onSuccess: () => { toast.success('Aktualizacja Windows wysłana'); setShowWinUpdate(false); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const wakeMutation = useMutation({
    mutationFn: () => agentsApi.wake(reg.id),
    onSuccess: () => toast.success('Pakiet WoL wysłany — komputer powinien się obudzić'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isOnline = reg.lastSeen
    ? new Date().getTime() - new Date(reg.lastSeen).getTime() < 2 * 60 * 1000
    : false;

  const uptime = reg.lastBootTime
    ? (() => {
        const diff = Math.floor((Date.now() - new Date(reg.lastBootTime).getTime()) / 1000);
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        return d > 0 ? `${d}d ${h}h` : `${h}h`;
      })()
    : null;

  const filteredSoftware = (reg.installedSoftware ?? []).filter(s =>
    s.name.toLowerCase().includes(softwareSearch.toLowerCase()) ||
    (s.publisher ?? '').toLowerCase().includes(softwareSearch.toLowerCase())
  );

  const needsUpdate = latestVersion && reg.appVersion && reg.appVersion !== latestVersion;

  return (
    <div className={glass} style={glassStyle}>
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: reg.status === 'ACTIVE' ? 'rgba(34,197,94,0.12)' : reg.status === 'PENDING' ? 'rgba(251,191,36,0.12)' : 'var(--hover-bg)',
            }}
          >
            <Monitor className="h-5 w-5" style={{
              color: reg.status === 'ACTIVE' ? '#4ADE80' : reg.status === 'PENDING' ? '#FBBF24' : 'var(--tm)',
            }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate" style={{ color: 'var(--t)' }}>
                {reg.hostname ?? 'Nieznany komputer'}
              </p>
              {isOnline
                ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
                    style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)', color: '#4ADE80' }}
                  >
                    <Wifi className="h-3 w-3" />Online
                  </span>
                )
                : (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
                    style={{ background: 'var(--hover-bg)', borderColor: 'var(--border)', color: 'var(--tm)' }}
                  >
                    <WifiOff className="h-3 w-3" />Offline
                  </span>
                )
              }
              {reg.status === 'PENDING' && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
                  style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.25)', color: '#FBBF24' }}
                >
                  <Clock className="h-3 w-3" />Oczekuje
                </span>
              )}
              {updateSent ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border animate-pulse"
                  style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.25)', color: '#A78BFA' }}
                >
                  <RefreshCw className="h-3 w-3 animate-spin" />Aktualizacja...
                </span>
              ) : (
                <VersionBadge appVersion={reg.appVersion} latestVersion={latestVersion} />
              )}
              {reg.client && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border"
                  style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.25)', color: '#A78BFA' }}
                >
                  {reg.status === 'PENDING' && <Check className="h-3 w-3" style={{ color: '#4ADE80' }} />}
                  {((reg as any))?.client?.name}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>
              {reg.ipAddress && <span>{reg.ipAddress} &middot; </span>}
              {reg.osInfo && <span>{reg.osInfo} &middot; </span>}
              {reg.currentUser && <span>{reg.currentUser}</span>}
              {reg.domain && reg.domain !== reg.hostname && <span> &middot; {reg.domain}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {reg.rustdeskId && (
              <a
                href={`rustdesk://id=${reg.rustdeskId}`}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', color: '#10B981' }}
                title={`Połącz RustDesk: ${reg.rustdeskId}`}
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                RustDesk
              </a>
            )}
            {reg.status === 'PENDING' && (
              reg.clientId
                ? (
                  <button onClick={() => onQuickApprove(reg)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-[0.97]"
                    style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.25)', color: '#4ADE80' }}>
                    <Check className="h-3.5 w-3.5" />
                    Aktywuj
                  </button>
                )
                : (
                  <button onClick={() => onApprove(reg)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-[0.97]"
                    style={{ background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.25)', color: '#A78BFA' }}>
                    <Monitor className="h-3.5 w-3.5" />
                    Dodaj do firmy
                  </button>
                )
            )}
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--tm)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#A78BFA'; (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--tm)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-1.5 pl-12">
          <MetricBar value={reg.cpuUsage} label="CPU" />
          <MetricBar value={reg.ramUsage} label="RAM" />
          {reg.diskTotal != null && reg.diskFree != null && reg.diskTotal > 0 && (
            <MetricBar value={(1 - reg.diskFree / reg.diskTotal) * 100} label="C:\\" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>

          {/* Hardware */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: 'var(--tm)' }}>
              <Cpu className="h-3.5 w-3.5" />Sprzet
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <InfoRow label="CPU" value={reg.cpuModel} />
              <InfoRow label="Rdzenie / watki" value={reg.cpuCores != null ? `${reg.cpuCores} / ${reg.cpuThreads ?? '?'}` : null} />
              <InfoRow label="RAM calkowita" value={reg.ramTotalGb != null ? `${reg.ramTotalGb} GB` : null} />
              <InfoRow label="GPU" value={reg.gpuModel} />
              <InfoRow label="Plyta glowna" value={reg.motherboard} />
              <InfoRow label="Nr seryjny" value={reg.serialNumber} />
              <InfoRow label="Windows" value={reg.windowsVersion} />
              <InfoRow label="Uptime" value={uptime} />
            </div>
          </div>

          {/* Disks */}
          {(reg.diskInfo ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: 'var(--tm)' }}>
                <HardDrive className="h-3.5 w-3.5" />Dyski
              </p>
              <div className="space-y-1.5">
                {(reg.diskInfo as DiskInfo[]).map(d => (
                  <div key={d.mountpoint} className="flex items-center gap-3 text-xs">
                    <span className="w-10 shrink-0" style={{ color: 'var(--tm)' }}>{d.mountpoint}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className={clsx('h-full rounded-full', d.usedPct > 90 ? 'bg-red-500' : d.usedPct > 70 ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${d.usedPct}%` }} />
                    </div>
                    <span className="w-36 shrink-0" style={{ color: 'var(--ts)' }}>{d.freeGb.toFixed(1)} GB wolne / {d.totalGb.toFixed(1)} GB &middot; {d.fstype}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Network */}
          {(reg.networkIfaces ?? []).filter((i: NetworkIface) => i.ip).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: 'var(--tm)' }}>
                <Network className="h-3.5 w-3.5" />Siec
              </p>
              <div className="space-y-1">
                {(reg.networkIfaces as NetworkIface[]).filter(i => i.ip).map(i => (
                  <div key={i.name} className="flex gap-4 text-xs">
                    <span className={clsx('w-2 h-2 rounded-full mt-0.5 shrink-0', i.isUp ? 'bg-emerald-500' : '')} style={!i.isUp ? { background: 'var(--td)' } : {}} />
                    <span className="w-40 truncate shrink-0" style={{ color: 'var(--tm)' }}>{i.name}</span>
                    <span className="font-mono" style={{ color: 'var(--t)' }}>{i.ip}</span>
                    {i.mac && <span className="font-mono" style={{ color: 'var(--tm)' }}>{i.mac}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Software */}
          {(reg.installedSoftware ?? []).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--tm)' }}>
                  <Package className="h-3.5 w-3.5" />Programy ({reg.installedSoftware!.length})
                </p>
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={softwareSearch}
                  onChange={e => setSoftwareSearch(e.target.value)}
                  className="text-xs rounded-lg px-2 py-1 w-40 focus:outline-none"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                />
              </div>
              <div
                className="max-h-48 overflow-y-auto rounded-lg"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
              >
                {filteredSoftware.map((s: InstalledSoftware, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-1.5 text-xs"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <span className="flex-1 font-medium truncate" style={{ color: 'var(--t)' }}>{s.name}</span>
                    {s.version && <span className="shrink-0" style={{ color: 'var(--tm)' }}>{s.version}</span>}
                    {s.publisher && <span className="shrink-0 hidden sm:block truncate max-w-[120px]" style={{ color: 'var(--tm)' }}>{s.publisher}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Footer — always visible actions ─────────────────────── */}
      {reg.status === 'ACTIVE' && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1 px-3 py-2">
            {/* RustDesk */}
            {reg.rustdeskId && (
              <a
                href={`rustdesk://id=${reg.rustdeskId}`}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)', color: '#10B981' }}
                title={`Połącz RustDesk: ${reg.rustdeskId}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                RustDesk
              </a>
            )}

            {/* WoL — offline only */}
            {!isOnline && (
              <button
                onClick={() => wakeMutation.mutate()}
                disabled={wakeMutation.isPending}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ color: '#4ADE80' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                title="Wake-on-LAN"
              >
                <Wifi className="h-3.5 w-3.5" />{wakeMutation.isPending ? 'Budzę...' : 'WoL'}
              </button>
            )}

            {/* Aktualizuj agenta */}
            <button
              onClick={() => pushUpdateMutation.mutate()}
              disabled={pushUpdateMutation.isPending || updateSent}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: updateSent ? '#4ADE80' : needsUpdate ? '#F87171' : '#A78BFA' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = needsUpdate ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pushUpdateMutation.isPending || updateSent ? 'animate-spin' : ''}`} />
              {updateSent ? 'Aktualizacja...' : needsUpdate ? 'Aktualizuj!' : 'Aktualizuj'}
            </button>

            {/* Aktualizuj Windows */}
            <button
              onClick={() => setShowWinUpdate(!showWinUpdate)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: '#60A5FA' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Monitor className="h-3.5 w-3.5" />
              Windows
            </button>

            <div className="flex-1" />

            {/* Usuń */}
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium" style={{ color: '#F87171' }}>Usunąć?</span>
                <button
                  onClick={() => { onDelete(reg.id); setConfirmDelete(false); }}
                  className="text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Tak
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--ts)' }}
                >
                  Nie
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--td)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLElement).style.color = '#F87171'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--td)'; }}
                title="Usuń asystenta"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Windows Update popup — below footer bar */}
          {showWinUpdate && (
            <div className="mx-3 mb-3 p-4 rounded-xl space-y-3" style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
              <p className="text-[12px] font-semibold" style={{ color: '#60A5FA' }}>Aktualizacja Windows</p>
              <div className="flex gap-2">
                <button onClick={() => setWinUpdateMode('reboot')}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all"
                  style={winUpdateMode === 'reboot'
                    ? { background: 'rgba(96,165,250,0.15)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.25)' }
                    : { background: 'var(--bg-card)', color: 'var(--tm)', border: '1px solid var(--border)' }
                  }>
                  Przy ponownym uruchomieniu
                </button>
                <button onClick={() => setWinUpdateMode('schedule')}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all"
                  style={winUpdateMode === 'schedule'
                    ? { background: 'rgba(96,165,250,0.15)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.25)' }
                    : { background: 'var(--bg-card)', color: 'var(--tm)', border: '1px solid var(--border)' }
                  }>
                  Zaplanuj restart
                </button>
              </div>
              {winUpdateMode === 'schedule' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: 'var(--tm)' }}>Restart o:</span>
                  <input type="time" value={winUpdateTime} onChange={e => setWinUpdateTime(e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-[12px] focus:outline-none"
                    style={{ background: '#0E1425', border: '1px solid var(--border)', color: 'var(--t)' }} />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => winUpdateMutation.mutate()} disabled={winUpdateMutation.isPending}
                  className="flex-1 py-2 rounded-lg text-[11px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                  style={{ background: 'linear-gradient(145deg, #2563EB, #1D4ED8)' }}>
                  {winUpdateMutation.isPending ? 'Wysyłam...' : 'Uruchom aktualizację'}
                </button>
                <button onClick={() => setShowWinUpdate(false)}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ color: 'var(--tm)' }}>
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ApproveModal v6 — uses workspace store (no extra fetch) ── */

function ApproveModal({ reg, onClose }: { reg: AgentRegistration; onClose: () => void }) {
  const qc = useQueryClient();
  const { workspaces: wsMemberships } = useWorkspace();
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [selectedWsId, setSelectedWsId] = useState('');
  const [saving, setSaving] = useState(false);

  // Build workspace list from store — already loaded, no fetch needed
  const workspaces = wsMemberships.map(m => ({ id: m.workspaceId, name: m.name }));

  // New client form
  const [newName, setNewName] = useState(reg.companyName ?? '');
  const [newNip, setNewNip] = useState(reg.nip ?? '');
  const [newPhone, setNewPhone] = useState(reg.contactPhone ?? '');
  const [newEmail, setNewEmail] = useState(reg.contactEmail ?? '');
  const [newCity, setNewCity] = useState('');

  const handleApproveExisting = async () => {
    if (!selectedWsId) { toast.error('Wybierz firmę'); return; }
    setSaving(true);
    try {
      await agentsApi.approve(reg.id, selectedWsId);
      toast.success('Asystent zatwierdzony');
      qc.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Błąd';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleApproveNew = async () => {
    if (!newName.trim()) { toast.error('Nazwa firmy jest wymagana'); return; }
    setSaving(true);
    try {
      await agentsApi.approveNewClient(reg.id, { name: newName, taxId: newNip, phone: newPhone, email: newEmail, city: newCity });
      toast.success('Firma utworzona i asystent zatwierdzony');
      qc.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div
      id="approve-overlay"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="rounded-2xl shadow-2xl w-full max-w-md"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 24, maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Title */}
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--t)' }}>
          Przypisz asystenta
        </h2>

        {/* Agent info */}
        <div className="rounded-xl p-3 mb-4 text-xs space-y-1" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
          {reg.hostname && <div><span style={{ color: 'var(--tm)' }}>Komputer: </span><strong style={{ color: 'var(--t)' }}>{reg.hostname}</strong></div>}
          {reg.companyName && <div><span style={{ color: 'var(--tm)' }}>Firma: </span><strong style={{ color: 'var(--t)' }}>{reg.companyName}</strong></div>}
          {reg.ipAddress && <div><span style={{ color: 'var(--tm)' }}>IP: </span><span style={{ color: 'var(--t)' }}>{reg.ipAddress}</span></div>}
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
          <button type="button" onClick={() => setTab('existing')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{ background: tab === 'existing' ? 'rgba(139,92,246,0.12)' : 'transparent', color: tab === 'existing' ? '#A78BFA' : 'var(--tm)', border: 'none', cursor: 'pointer' }}>
            Istniejąca firma
          </button>
          <button type="button" onClick={() => setTab('new')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{ background: tab === 'new' ? 'rgba(139,92,246,0.12)' : 'transparent', color: tab === 'new' ? '#A78BFA' : 'var(--tm)', border: 'none', cursor: 'pointer' }}>
            Nowa firma
          </button>
        </div>

        {tab === 'existing' ? (
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--tm)' }}>Wybierz firmę *</div>
            {workspaces.length === 0 ? (
              <div className="text-xs text-center py-6" style={{ color: 'var(--tm)' }}>Brak firm. Użyj zakładki "Nowa firma".</div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto rounded-lg mb-4 p-1" style={{ border: '1px solid var(--border)' }}>
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    onClick={() => setSelectedWsId(ws.id)}
                    className="flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: selectedWsId === ws.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                      border: selectedWsId === ws.id ? '2px solid #A78BFA' : '2px solid transparent',
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{ws.name}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--tm)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Anuluj</button>
              <button type="button" onClick={handleApproveExisting} disabled={saving || !selectedWsId}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                style={{ background: '#7C3AED', border: 'none', cursor: saving || !selectedWsId ? 'default' : 'pointer' }}>
                {saving ? 'Zapisuję...' : 'Zatwierdź'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--tm)' }}>Nazwa firmy *</label>
                <input className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--tm)' }}>NIP</label>
                <input className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} value={newNip} onChange={e => setNewNip(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--tm)' }}>Telefon</label>
                <input className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--tm)' }}>E-mail</label>
                <input type="email" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--tm)' }}>Miasto</label>
                <input className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} value={newCity} onChange={e => setNewCity(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--tm)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Anuluj</button>
              <button type="button" onClick={handleApproveNew} disabled={saving || !newName.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                style={{ background: '#7C3AED', border: 'none', cursor: saving || !newName.trim() ? 'default' : 'pointer' }}>
                {saving ? 'Zapisuję...' : 'Utwórz i zatwierdź'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export function WaitingRoomPage() {
  const qc = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<AgentRegistration | null>(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [agentTypeFilter, setAgentTypeFilter] = useState<'ALL' | 'CLIENT' | 'SERVER'>('ALL');

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    refetchInterval: 30_000,
  });

  const { data: latestVersion } = useQuery({
    queryKey: ['agent-version'],
    queryFn: () => fetch('/downloads/version.json').then(r => r.json()) as Promise<{ version: string }>,
    refetchInterval: 60_000,
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => { toast.success('Usunięto asystenta'); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const quickApproveMutation = useMutation({
    mutationFn: (reg: AgentRegistration) => {
      // Quick approve only works if agent has workspace assigned
      if (!reg.workspaceId) throw new Error('Brak workspace — użyj pełnego zatwierdzenia');
      return agentsApi.approve(reg.id, reg.workspaceId, undefined);
    },
    onSuccess: () => {
      toast.success('Asystent zatwierdzony — urządzenie dodane automatycznie');
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filtered = registrations.filter(r => {
    if (companyFilter && (r as any).workspaceId !== companyFilter) return false;
    if (agentTypeFilter !== 'ALL' && (r.agentType || 'CLIENT') !== agentTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.hostname ?? '').toLowerCase().includes(q) &&
          !(r.contactFirstName ?? '').toLowerCase().includes(q) &&
          !(r.contactLastName ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pending = filtered.filter(r => r.status === 'PENDING');
  const active  = filtered.filter(r => r.status === 'ACTIVE');

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t)' }}>Asystenci systemowi</h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm" style={{ color: 'var(--tm)' }}>
            {registrations.length} {registrations.length === 1 ? 'asystent' : 'asystentów'} zarejestrowanych
          </p>
          {latestVersion?.version && (() => {
            const activeRegs = registrations.filter(r => r.status === 'ACTIVE');
            const upToDate = activeRegs.filter(r => r.appVersion === latestVersion.version).length;
            const outdated = activeRegs.filter(r => r.appVersion && r.appVersion !== latestVersion.version).length;
            const noVersion = activeRegs.filter(r => !r.appVersion).length;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 border"
                  style={{ background: 'rgba(139,92,246,0.12)', borderColor: 'rgba(139,92,246,0.25)', color: '#A78BFA' }}
                >
                  Aktualna: v{latestVersion.version}
                </span>
                {upToDate > 0 && (
                  <span className="text-xs font-medium" style={{ color: '#4ADE80' }}>
                    {upToDate} aktualnych
                  </span>
                )}
                {outdated > 0 && (
                  <button
                    className="text-xs font-medium flex items-center gap-1 transition-colors hover:underline"
                    style={{ color: '#F87171' }}
                    disabled={bulkUpdating}
                    onClick={async () => {
                      setBulkUpdating(true);
                      const outdatedRegs = activeRegs.filter(r => r.appVersion && r.appVersion !== latestVersion.version);
                      try {
                        await Promise.all(outdatedRegs.map(r => agentsApi.pushUpdate(r.id)));
                        toast.success(`Aktualizacja wysłana do ${outdatedRegs.length} asystentów`);
                        setTimeout(() => {
                          qc.invalidateQueries({ queryKey: ['agents'] });
                          setBulkUpdating(false);
                        }, 30_000);
                      } catch {
                        toast.error('Błąd wysyłania aktualizacji');
                        setBulkUpdating(false);
                      }
                    }}
                  >
                    {bulkUpdating ? (
                      <><RefreshCw className="h-3 w-3 animate-spin" />{outdated} aktualizowanie...</>
                    ) : (
                      <>{outdated} do aktualizacji — kliknij aby zaktualizować</>
                    )}
                  </button>
                )}
                {noVersion > 0 && (
                  <span className="text-xs font-medium" style={{ color: 'var(--tm)' }}>
                    {noVersion} bez wersji
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--hover-bg)' }}>
        {(['ALL', 'CLIENT', 'SERVER'] as const).map(t => {
          const count = t === 'ALL' ? registrations.length : registrations.filter(r => (r.agentType || 'CLIENT') === t).length;
          const label = t === 'ALL' ? 'Wszystkie' : t === 'CLIENT' ? 'Komputery' : 'Serwery';
          return (
            <button key={t} onClick={() => setAgentTypeFilter(t)}
              className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: agentTypeFilter === t ? 'rgba(79,140,255,0.2)' : 'transparent',
                color: agentTypeFilter === t ? '#A78BFA' : 'var(--tm)',
              }}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <MspCompanyFilter value={companyFilter} onChange={setCompanyFilter} />
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--tm)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj (hostname, uzytkownik)..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          />
        </div>
        {search && (
          <button
            onClick={() => { setSearch(''); }}
            className="text-xs underline"
            style={{ color: 'var(--tm)' }}
          >
            Wyczysc filtry
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm" style={{ color: 'var(--tm)' }}>Ladowanie...</p>}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: '#FBBF24' }}>
            <Clock className="h-4 w-4" />
            Poczekalnia ({pending.length})
          </h2>
          {pending.map(reg => (
            <AgentRow
              key={reg.id}
              reg={reg}
              latestVersion={latestVersion?.version}
              onApprove={setApproveTarget}
              onQuickApprove={r => quickApproveMutation.mutate(r)}
              onDelete={id => deleteMutation.mutate(id)}
            />
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: '#4ADE80' }}>
            <Wifi className="h-4 w-4" />
            Aktywne ({active.length})
          </h2>
          {active.map(reg => (
            <AgentRow
              key={reg.id}
              reg={reg}
              latestVersion={latestVersion?.version}
              onApprove={setApproveTarget}
              onQuickApprove={r => quickApproveMutation.mutate(r)}
              onDelete={id => deleteMutation.mutate(id)}
            />
          ))}
        </section>
      )}

      {!isLoading && registrations.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--tm)' }}>
          <Monitor className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Brak asystentów</p>
          <p className="text-sm mt-1">Zainstaluj aplikacje na komputerach klientow, aby monitorowac sprzet.</p>
        </div>
      )}

      {approveTarget && (
        <ApproveModal reg={approveTarget} onClose={() => setApproveTarget(null)} />
      )}
    </div>
  );
}
