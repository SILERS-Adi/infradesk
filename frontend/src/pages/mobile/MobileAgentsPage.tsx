import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Wifi, WifiOff, Clock, Check, Trash2, ChevronDown, ChevronUp,
  Cpu, HardDrive, RefreshCw, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { agentsApi, type AgentRegistration } from '../../api/agents';
import { getErrorMessage } from '../../utils/helpers';
import { clsx } from 'clsx';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 16,
  ...extra,
});

function MetricBar({ value, label }: { value?: number; label: string }) {
  if (value == null) return null;
  const pct = Math.round(value);
  const color = pct > 90 ? '#EF4444' : pct > 70 ? '#FBBF24' : '#4ADE80';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-10 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{pct}%</span>
    </div>
  );
}

function timeAgo(d: string | undefined | null) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'teraz';
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h temu`;
  return `${Math.floor(h / 24)}d temu`;
}

export function MobileAgentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    refetchInterval: 15_000,
  });

  const { data: latestVersion } = useQuery({
    queryKey: ['agent-version'],
    queryFn: () => fetch('/downloads/version.json').then(r => r.json()) as Promise<{ version: string }>,
    refetchInterval: 60_000,
    retry: false,
  });

  const quickApproveMutation = useMutation({
    mutationFn: (reg: AgentRegistration) => agentsApi.approve(reg.id, undefined, undefined),
    onSuccess: () => {
      toast.success('Agent zatwierdzony');
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const pushUpdateMutation = useMutation({
    mutationFn: (id: string) => agentsApi.pushUpdate(id),
    onSuccess: () => toast.success('Aktualizacja wysłana'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => { toast.success('Usunięto'); qc.invalidateQueries({ queryKey: ['agents'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filtered = registrations.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.hostname ?? '').toLowerCase().includes(q) ||
      (r.client?.name ?? '').toLowerCase().includes(q) ||
      (r.currentUser ?? '').toLowerCase().includes(q);
  });

  // Sort: newest first (by createdAt or lastSeen)
  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.createdAt ?? 0).getTime();
    const dateB = new Date(b.createdAt ?? 0).getTime();
    return dateB - dateA;
  });

  const pending = sorted.filter(r => r.status === 'PENDING');
  const active = sorted.filter(r => r.status === 'ACTIVE');

  return (
    <div className="px-5 pt-2 pb-4 space-y-4">
      <div className="pt-1">
        <h1 className="text-[20px] font-semibold text-white/90">Agenci</h1>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {registrations.length} agentów
          {latestVersion?.version && <span> · akt. v{latestVersion.version}</span>}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj (hostname, firma, użytkownik)..."
          className="w-full pl-9 pr-3 py-2.5 text-[13px] rounded-xl focus:outline-none transition-all placeholder:text-white/20"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4" style={{ color: '#FBBF24' }} />
            <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#FBBF24' }}>
              Oczekujące ({pending.length})
            </span>
          </div>
          <div className="space-y-2">
            {pending.map(reg => (
              <AgentCard key={reg.id} reg={reg} latestVersion={latestVersion?.version}
                expanded={expandedId === reg.id} onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                onApprove={() => quickApproveMutation.mutate(reg)}
                onPushUpdate={() => pushUpdateMutation.mutate(reg.id)}
                onDelete={() => deleteMutation.mutate(reg.id)}
                isPending />
            ))}
          </div>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4" style={{ color: '#A78BFA' }} />
            <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Aktywne ({active.length})
            </span>
          </div>
          <div className="space-y-2">
            {active.map(reg => (
              <AgentCard key={reg.id} reg={reg} latestVersion={latestVersion?.version}
                expanded={expandedId === reg.id} onToggle={() => setExpandedId(expandedId === reg.id ? null : reg.id)}
                onPushUpdate={() => pushUpdateMutation.mutate(reg.id)}
                onDelete={() => deleteMutation.mutate(reg.id)} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="text-center py-12" style={glass({ padding: '32px 20px' })}>
          <Bot className="h-8 w-8 mx-auto mb-2.5" style={{ color: 'rgba(255,255,255,0.06)' }} />
          <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>Brak agentów</p>
        </div>
      )}
    </div>
  );
}

/* ── Agent Card ──────────────────────────────────────────────────────────── */
function AgentCard({ reg, latestVersion, expanded, onToggle, onApprove, onPushUpdate, onDelete, isPending }: {
  reg: AgentRegistration; latestVersion?: string;
  expanded: boolean; onToggle: () => void;
  onApprove?: () => void; onPushUpdate: () => void; onDelete: () => void;
  isPending?: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const isOnline = reg.lastSeen ? Date.now() - new Date(reg.lastSeen).getTime() < 2 * 60 * 1000 : false;
  const isOutdated = latestVersion && reg.appVersion && reg.appVersion !== latestVersion;
  const isCurrent = latestVersion && reg.appVersion && reg.appVersion === latestVersion;

  return (
    <div style={glass()}>
      {/* Header */}
      <div className="p-3.5 flex items-start gap-3" onClick={onToggle}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: isPending ? 'rgba(251,191,36,0.1)' : isOnline ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)' }}>
          <Bot className="h-4.5 w-4.5" style={{ color: isPending ? '#FBBF24' : isOnline ? '#4ADE80' : 'rgba(255,255,255,0.25)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-white/85 truncate">{reg.hostname ?? 'Nieznany'}</span>
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />ON
              </span>
            ) : !isPending ? (
              <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>OFF</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {reg.client && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>{reg.client.name}</span>
            )}
            {/* Version badge */}
            {reg.appVersion ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={isCurrent
                  ? { background: 'rgba(34,197,94,0.12)', color: '#4ADE80' }
                  : isOutdated
                    ? { background: 'rgba(239,68,68,0.12)', color: '#F87171' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }
                }>
                v{reg.appVersion} {isCurrent ? '✓' : isOutdated ? '✗' : ''}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}>brak wersji</span>
            )}
          </div>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {reg.ipAddress}{reg.currentUser ? ` · ${reg.currentUser}` : ''}{reg.lastSeen ? ` · ${timeAgo(reg.lastSeen)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending && onApprove && (
            <button onClick={e => { e.stopPropagation(); onApprove(); }}
              className="p-2 rounded-lg active:scale-95 transition-all"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
              <Check className="h-4 w-4" />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />}
        </div>
      </div>

      {/* Metrics (always visible for active) */}
      {!isPending && (reg.cpuUsage != null || reg.ramUsage != null) && (
        <div className="px-3.5 pb-3 space-y-1">
          <MetricBar value={reg.cpuUsage} label="CPU" />
          <MetricBar value={reg.ramUsage} label="RAM" />
          {reg.diskTotal != null && reg.diskFree != null && reg.diskTotal > 0 && (
            <MetricBar value={(1 - reg.diskFree / reg.diskTotal) * 100} label="Dysk" />
          )}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Hardware */}
          <div className="space-y-1 text-[11px]">
            {reg.cpuModel && <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>CPU:</span> <span className="text-white/60">{reg.cpuModel}</span></div>}
            {reg.ramTotalGb != null && <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>RAM:</span> <span className="text-white/60">{reg.ramTotalGb} GB</span></div>}
            {reg.windowsVersion && <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>OS:</span> <span className="text-white/60">{reg.windowsVersion}</span></div>}
            {reg.rustdeskId && <div><span style={{ color: 'rgba(255,255,255,0.3)' }}>RustDesk:</span> <span className="text-white/60 font-mono">{reg.rustdeskId}</span></div>}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isOutdated && (
              <button onClick={() => onPushUpdate()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold active:scale-95 transition-all"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.15)' }}>
                <RefreshCw className="h-3.5 w-3.5" /> Aktualizuj
              </button>
            )}
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium active:scale-95 transition-all ml-auto"
                style={{ color: 'rgba(248,113,113,0.6)' }}>
                <Trash2 className="h-3.5 w-3.5" /> Usuń
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => { onDelete(); setConfirmDel(false); }}
                  className="px-3 py-2 rounded-xl text-[11px] font-semibold active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>Tak, usuń</button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-3 py-2 rounded-xl text-[11px] font-medium active:scale-95"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Anuluj</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
