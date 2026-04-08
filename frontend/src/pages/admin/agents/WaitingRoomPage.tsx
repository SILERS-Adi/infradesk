import { useState, useEffect } from 'react';
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

/* ── ApproveModal v4 — ultra proste, workspace lista z /superadmin/tenants ── */

function ApproveModal({ reg, onClose }: { reg: AgentRegistration; onClose: () => void }) {
  const qc = useQueryClient();
  const { resolved: themeMode } = useTheme();
  const isLight = themeMode === 'light';
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedWsId, setSelectedWsId] = useState('');
  const [saving, setSaving] = useState(false);

  // New client form
  const [newName, setNewName] = useState(reg.companyName ?? '');
  const [newNip, setNewNip] = useState(reg.nip ?? '');
  const [newPhone, setNewPhone] = useState(reg.contactPhone ?? '');
  const [newEmail, setNewEmail] = useState(reg.contactEmail ?? '');
  const [newCity, setNewCity] = useState('');

  // Load ALL workspaces — two sources, use whichever works
  const { data: workspaces = [], isLoading: loadingWs } = useQuery({
    queryKey: ['approve-workspaces'],
    queryFn: async () => {
      // Try operator clients first
      try {
        const clients = await apiClient.get('/operator/clients').then(r => r.data);
        if (clients?.length > 0) return clients.map((c: any) => ({ id: c.workspace?.id, name: c.workspace?.name, taxId: c.workspace?.taxId })).filter((w: any) => w.id);
      } catch {}
      // Fallback: all workspaces (superadmin or workspace list)
      try {
        const all = await apiClient.get('/superadmin/workspaces-list').then(r => r.data);
        if (all?.length > 0) return all.map((w: any) => ({ id: w.id, name: w.name, taxId: w.taxId }));
      } catch {}
      // Last resort: workspace relations
      try {
        const rels = await apiClient.get('/workspace-relations').then(r => r.data);
        if (rels?.length > 0) return rels.map((r: any) => ({ id: r.clientWorkspaceId ?? r.id, name: r.clientWorkspace?.name ?? r.name ?? '?', taxId: null }));
      } catch {}
      return [];
    },
  });

  // Auto-match by NIP
  useEffect(() => {
    if (selectedWsId || !reg.nip || workspaces.length === 0) return;
    const match = workspaces.find((w: any) => w.taxId === reg.nip);
    if (match) setSelectedWsId(match.id);
  }, [workspaces, reg.nip, selectedWsId]);

  const handleApproveExisting = async () => {
    if (!selectedWsId) { toast.error('Wybierz firmę'); return; }
    setSaving(true);
    try {
      await agentsApi.approve(reg.id, selectedWsId);
      toast.success('Agent zatwierdzony');
      qc.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const handleApproveNew = async () => {
    if (!newName.trim()) { toast.error('Nazwa firmy jest wymagana'); return; }
    setSaving(true);
    try {
      await agentsApi.approveNewClient(reg.id, { name: newName, taxId: newNip, phone: newPhone, email: newEmail, city: newCity });
      toast.success('Firma utworzona i agent zatwierdzony');
      qc.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  // Explicit colors — no CSS variables (Chrome <option> issue)
  const c = {
    bg: isLight ? '#ffffff' : '#0c1324',
    bgAlt: isLight ? '#f3f4f6' : '#1c2536',
    text: isLight ? '#111827' : '#f3f4f6',
    muted: isLight ? '#6b7280' : '#9ca3af',
    border: isLight ? '#e5e7eb' : '#1f2937',
    accent: isLight ? '#6366f1' : '#818cf8',
    accentBg: isLight ? 'rgba(99,102,241,0.08)' : 'rgba(129,140,248,0.12)',
    selected: isLight ? '#eef2ff' : 'rgba(99,102,241,0.15)',
  };
  const inputS: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: c.bgAlt, border: `1px solid ${c.border}`, color: c.text, outline: 'none' };
  const labelS: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: c.muted, marginBottom: 4 };
  const btnSecondary: React.CSSProperties = { padding: '8px 20px', borderRadius: 10, border: `1px solid ${c.border}`, background: 'transparent', color: c.muted, cursor: 'pointer', fontSize: 12, fontWeight: 500 };
  const btnPrimary: React.CSSProperties = { padding: '8px 20px', borderRadius: 10, border: 'none', background: c.accent, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 16 }}>Zatwierdź urządzenie</div>

        {/* Info */}
        <div style={{ padding: 12, borderRadius: 10, background: c.bgAlt, border: `1px solid ${c.border}`, marginBottom: 16, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px' }}>
            {reg.companyName && <><span style={{ color: c.muted }}>Firma</span><span style={{ color: c.text, fontWeight: 500 }}>{reg.companyName}</span></>}
            {reg.nip && <><span style={{ color: c.muted }}>NIP</span><span style={{ color: c.text, fontWeight: 500 }}>{reg.nip}</span></>}
            {reg.hostname && <><span style={{ color: c.muted }}>Komputer</span><span style={{ color: c.text, fontWeight: 500 }}>{reg.hostname}</span></>}
            {reg.ipAddress && <><span style={{ color: c.muted }}>IP</span><span style={{ color: c.text, fontWeight: 500 }}>{reg.ipAddress}</span></>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${c.border}`, marginBottom: 16 }}>
          {(['existing', 'new'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === m ? c.accentBg : 'transparent', color: mode === m ? c.accent : c.muted }}>
              {m === 'existing' ? 'Istniejąca firma' : 'Nowa firma'}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <>
            <div style={labelS}>Wybierz firmę *</div>
            {loadingWs ? (
              <div style={{ padding: 16, textAlign: 'center', color: c.muted, fontSize: 12 }}>Ładowanie...</div>
            ) : workspaces.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: c.muted, fontSize: 12 }}>Brak firm — dodaj klienta w sekcji Firmy klientów</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto', border: `1px solid ${c.border}`, borderRadius: 8, padding: 4, marginBottom: 16 }}>
                {workspaces.map((ws: any) => {
                  const wsId = ws.id;
                  const wsName = ws.name ?? '—';
                  const wsTaxId = ws.taxId;
                  const isSelected = selectedWsId === wsId;
                  const isMatch = reg.nip && wsTaxId === reg.nip;
                  return (
                    <div key={wsId} onClick={() => setSelectedWsId(wsId)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                        background: isSelected ? c.selected : 'transparent', border: isSelected ? `2px solid ${c.accent}` : '2px solid transparent',
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{wsName}</div>
                        {wsTaxId && <div style={{ fontSize: 10, color: c.muted }}>NIP: {wsTaxId}</div>}
                      </div>
                      {isMatch && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>NIP pasuje</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Anuluj</button>
              <button type="button" onClick={handleApproveExisting} disabled={saving || !selectedWsId}
                style={{ ...btnPrimary, opacity: saving || !selectedWsId ? 0.5 : 1 }}>
                {saving ? 'Zapisuję...' : 'Zatwierdź'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: 'span 2' }}><label style={labelS}>Nazwa firmy *</label><input style={inputS} value={newName} onChange={e => setNewName(e.target.value)} /></div>
              <div><label style={labelS}>NIP</label><input style={inputS} value={newNip} onChange={e => setNewNip(e.target.value)} /></div>
              <div><label style={labelS}>Telefon</label><input style={inputS} value={newPhone} onChange={e => setNewPhone(e.target.value)} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelS}>E-mail</label><input style={inputS} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelS}>Miasto</label><input style={inputS} value={newCity} onChange={e => setNewCity(e.target.value)} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Anuluj</button>
              <button type="button" onClick={handleApproveNew} disabled={saving || !newName.trim()}
                style={{ ...btnPrimary, opacity: saving || !newName.trim() ? 0.5 : 1 }}>
                {saving ? 'Zapisuję...' : 'Utwórz i zatwierdź'}
              </button>
            </div>
          </>
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
