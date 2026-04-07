// @ts-nocheck
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Monitor, Check, Trash2, Wifi, WifiOff, Clock, ChevronDown, ChevronUp, Cpu, HardDrive, Network, Package, RefreshCw, Search, ExternalLink } from 'lucide-react';
import { agentsApi, AgentRegistration, InstalledSoftware, DiskInfo, NetworkIface } from '../../../api/agents';
import { devicesApi } from '../../../api/devices';
import { apiClient } from '../../../api/client';
import { MspCompanyFilter } from '../../../components/ui/MspCompanyFilter';
import { Button } from '../../../components/ui/Button';
import { getErrorMessage } from '../../../utils/helpers';
import { clsx } from 'clsx';
import { useTheme } from '../../../store/themeStore';

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
      toast.success('Komenda aktualizacji wysłana — agent restartuje się za chwilę');
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
                  <Button size="sm" onClick={() => onQuickApprove(reg)} className="bg-emerald-600 hover:bg-emerald-700">
                    <Check className="h-4 w-4" />
                    Zatwierdz
                  </Button>
                )
                : (
                  <Button size="sm" onClick={() => onApprove(reg)}>
                    <Check className="h-4 w-4" />
                    Przypisz
                  </Button>
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
                title="Usuń agenta"
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

/* ── ApproveModal ─────────────────────────────────────────
 * Theme-aware modal using InfraDesk design tokens.
 * Pattern: same as SATenantsPage modals (var(--bg2), var(--t), var(--border)).
 * No hardcoded dark styles — fully light/dark responsive.
 * ──────────────────────────────────────────────────────── */
interface ApproveForm { workspaceId: string; deviceId?: string; }
interface NewClientForm { name: string; taxId?: string; phone?: string; email?: string; addressLine1?: string; postalCode?: string; city?: string; }

function ApproveModal({ reg, onClose }: { reg: AgentRegistration; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  const { data: clients = [] } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: () => apiClient.get('/operator/clients').then(r => r.data).catch(() => []),
  });

  // Auto-match workspace by NIP from agent registration
  const autoMatchedWsId = (() => {
    if (reg.workspaceId) return reg.workspaceId;
    if (reg.nip) {
      const match = clients.find((c: any) => c.workspace?.taxId === reg.nip);
      if (match) return match.workspace.id;
    }
    return '';
  })();

  const { register: regExisting, handleSubmit: handleExisting, reset: resetExisting } = useForm<ApproveForm>({
    defaultValues: { workspaceId: autoMatchedWsId, deviceId: '' },
  });

  // Re-set workspace when clients load and NIP matches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoMatchedWsId) resetExisting({ workspaceId: autoMatchedWsId, deviceId: '' }); }, [autoMatchedWsId]);

  const { register: regNew, handleSubmit: handleNew } = useForm<NewClientForm>({
    defaultValues: { name: reg.companyName ?? '', taxId: reg.nip ?? '', phone: reg.contactPhone ?? '', email: reg.contactEmail ?? '' },
  });

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: () => devicesApi.getAll({}) });

  const onSuccess = () => { toast.success('Agent zatwierdzony'); qc.invalidateQueries({ queryKey: ['agents'] }); qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); };

  const existingMut = useMutation({
    mutationFn: (d: ApproveForm) => agentsApi.approve(reg.id, d.workspaceId || undefined, d.deviceId || undefined),
    onSuccess, onError: (e) => toast.error(getErrorMessage(e)),
  });

  const newClientMut = useMutation({
    mutationFn: (d: NewClientForm) => agentsApi.approveNewClient(reg.id, d),
    onSuccess, onError: (e) => toast.error(getErrorMessage(e)),
  });

  /* ── shared styles ── */
  // Native <select><option> ignores CSS variables — use explicit colors based on theme
  const { resolved: themeMode } = useTheme();
  const isLight = themeMode === 'light';
  const colors = {
    bg: isLight ? '#ffffff' : '#0c1324',
    bgInput: isLight ? '#f3f4f6' : '#1c2536',
    text: isLight ? '#111827' : '#f3f4f6',
    textMuted: isLight ? '#6b7280' : '#9ca3af',
    border: isLight ? '#e5e7eb' : '#1f2937',
    accent: isLight ? '#6366f1' : '#818cf8',
    accentBg: isLight ? 'rgba(99,102,241,0.1)' : 'rgba(129,140,248,0.15)',
  };
  const input: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    background: colors.bgInput, border: `1px solid ${colors.border}`, color: colors.text, outline: 'none',
  };
  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 4 };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
    background: active ? colors.accentBg : 'transparent', color: active ? colors.accent : colors.textMuted,
  });

  return (
    /* Overlay */
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      {/* Panel */}
      <div onClick={e => e.stopPropagation()} style={{
        background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 16 }}>Zatwierdź urządzenie</div>

        {/* Agent info */}
        <div style={{ padding: 12, borderRadius: 10, background: colors.bgInput, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px', fontSize: 12 }}>
            {reg.companyName && <><span style={{ color: colors.textMuted }}>Firma</span><span style={{ color: colors.text, fontWeight: 500 }}>{reg.companyName}</span></>}
            {reg.nip && <><span style={{ color: colors.textMuted }}>NIP</span><span style={{ color: colors.text, fontWeight: 500 }}>{reg.nip}</span></>}
            {reg.hostname && <><span style={{ color: colors.textMuted }}>Komputer</span><span style={{ color: colors.text, fontWeight: 500 }}>{reg.hostname}</span></>}
            {reg.ipAddress && <><span style={{ color: colors.textMuted }}>IP</span><span style={{ color: colors.text, fontWeight: 500 }}>{reg.ipAddress}</span></>}
            {reg.contactEmail && <><span style={{ color: colors.textMuted }}>E-mail</span><span style={{ color: colors.text, fontWeight: 500 }}>{reg.contactEmail}</span></>}
          </div>
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${colors.border}`, marginBottom: 16 }}>
          <button type="button" onClick={() => setMode('existing')} style={tabBtn(mode === 'existing')}>Przypisz do istniejącej firmy</button>
          <button type="button" onClick={() => setMode('new')} style={tabBtn(mode === 'new')}>Utwórz nową firmę</button>
        </div>

        {/* Content */}
        {mode === 'existing' ? (
          <form onSubmit={handleExisting(d => existingMut.mutate(d))}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={label}>Firma (workspace) *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 4 }}>
                  {clients.length === 0 && <div style={{ padding: 8, fontSize: 12, color: colors.textMuted }}>Brak firm klientów</div>}
                  {clients.map((c: any) => {
                    const wsId = c.workspace?.id;
                    const wsName = c.workspace?.name ?? '—';
                    return (
                      <label key={wsId ?? c.relationId} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                        background: 'transparent', fontSize: 13, color: colors.text,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = colors.bgInput)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <input type="radio" value={wsId} {...regExisting('workspaceId', { required: true })}
                          style={{ accentColor: colors.accent }} />
                        <span style={{ fontWeight: 500 }}>{wsName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={label}>Urządzenie (opcjonalne)</label>
                <select style={{ ...input, color: colors.text, backgroundColor: colors.bgInput }}>
                  <option value="" style={{ color: colors.text, backgroundColor: colors.bg }}>— auto-utwórz nowe urządzenie —</option>
                  {devices.map((d: any) => <option key={d.id} value={d.id} style={{ color: colors.text, backgroundColor: colors.bg }}>{d.name}</option>)}
                </select>
                <input type="hidden" {...regExisting('deviceId')} />
              </div>
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Anuluj</button>
              <button type="submit" disabled={existingMut.isPending} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: existingMut.isPending ? 0.6 : 1 }}>
                {existingMut.isPending ? 'Zapisuję...' : 'Zatwierdź'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleNew(d => newClientMut.mutate(d))}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: 'span 2' }}><label style={label}>Nazwa firmy *</label><input style={input} placeholder="np. ACME Sp. z o.o." {...regNew('name', { required: true })} /></div>
              <div><label style={label}>NIP</label><input style={input} placeholder="0000000000" {...regNew('taxId')} /></div>
              <div><label style={label}>Telefon</label><input style={input} placeholder="+48 000 000 000" {...regNew('phone')} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={label}>E-mail</label><input style={input} type="email" placeholder="firma@email.pl" {...regNew('email')} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={label}>Adres</label><input style={input} placeholder="ul. Przykładowa 1" {...regNew('addressLine1')} /></div>
              <div><label style={label}>Kod pocztowy</label><input style={input} placeholder="00-000" {...regNew('postalCode')} /></div>
              <div><label style={label}>Miasto</label><input style={input} placeholder="Warszawa" {...regNew('city')} /></div>
            </div>
            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Anuluj</button>
              <button type="submit" disabled={newClientMut.isPending} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: newClientMut.isPending ? 0.6 : 1 }}>
                {newClientMut.isPending ? 'Zapisuję...' : 'Utwórz firmę i zatwierdź'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
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
    onSuccess: () => { toast.success('Usunieto agenta'); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const quickApproveMutation = useMutation({
    mutationFn: (reg: AgentRegistration) => {
      // Quick approve only works if agent has workspace assigned
      if (!reg.workspaceId) throw new Error('Brak workspace — użyj pełnego zatwierdzenia');
      return agentsApi.approve(reg.id, reg.workspaceId, undefined);
    },
    onSuccess: () => {
      toast.success('Agent zatwierdzony — urządzenie dodane automatycznie');
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
            {registrations.length} {registrations.length === 1 ? 'agent' : 'agentow'} zarejestrowanych
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
                        toast.success(`Aktualizacja wysłana do ${outdatedRegs.length} agentów`);
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
          <p className="font-medium">Brak agentow</p>
          <p className="text-sm mt-1">Zainstaluj aplikacje na komputerach klientow, aby monitorowac sprzet.</p>
        </div>
      )}

      {approveTarget && (
        <ApproveModal reg={approveTarget} onClose={() => setApproveTarget(null)} />
      )}
    </div>
  );
}
