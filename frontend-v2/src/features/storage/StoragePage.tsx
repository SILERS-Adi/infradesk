import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HardDrive, Server, Building2 , Infinity as InfinityIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface VpsInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
}

interface OverviewResp {
  vps: VpsInfo | null;
  summary: { workspaceCount: number; dyskBytes: string; backupBytes: string; totalBytes: string };
}

interface WorkspaceItem {
  id: string;
  name: string;
  type: 'MSP' | 'CLIENT' | 'INTERNAL_IT';
  plan: string;
  isActive: boolean;
  quotaBytes: string | null;
  usedBytes: string;
  dyskBytes: string;
  backupBytes: string;
  usedPct: number | null;
}

function humanBytes(input: string | number): string {
  const n = typeof input === 'string' ? Number(input) : input;
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n < 1_099_511_627_776) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  return `${(n / 1_099_511_627_776).toFixed(2)} TB`;
}

function progressColor(pct: number | null): string {
  if (pct == null) return 'var(--pri)';
  if (pct >= 90) return '#EF4444';
  if (pct >= 75) return '#F59E0B';
  return '#10B981';
}

const TYPE_META: Record<string, { label: string; variant: 'success' | 'info' | 'neutral' }> = {
  MSP:         { label: 'MSP',         variant: 'success' },
  INTERNAL_IT: { label: 'Internal IT', variant: 'info' },
  CLIENT:      { label: 'Klient',      variant: 'neutral' },
};

function QuotaEditor({ ws, onSaved }: { ws: WorkspaceItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(
    ws.quotaBytes ? String(Math.round(Number(ws.quotaBytes) / (1024 * 1024 * 1024) * 10) / 10) : ''
  );
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[12px] text-tx2 hover:text-pri transition-colors underline-offset-2 hover:underline"
      >
        {ws.quotaBytes ? `Limit: ${humanBytes(ws.quotaBytes)}` : 'Limit: bez limitu'}
        <span className="ml-1 text-tx3">(zmień)</span>
      </button>
    );
  }

  const save = async (newQuotaBytes: number | null) => {
    setSaving(true);
    try {
      await api.put(`/storage/workspaces/${ws.id}/quota`, { quotaBytes: newQuotaBytes });
      toast.success('Limit zaktualizowany');
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.5"
        min="0"
        max="10000"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="GB"
        className="w-20 px-2 py-1 text-[12px] rounded border bg-sf-h border-bd text-tx focus:outline-none focus:border-pri"
      />
      <span className="text-[11px] text-tx3">GB</span>
      <button
        type="button"
        onClick={() => save(value ? Math.floor(Number(value) * 1024 * 1024 * 1024) : null)}
        disabled={saving}
        className="px-2 py-1 text-[11px] rounded bg-pri text-white hover:brightness-110 disabled:opacity-50"
      >
        Zapisz
      </button>
      <button
        type="button"
        onClick={() => save(null)}
        disabled={saving}
        title="Bez limitu"
        className="px-2 py-1 text-[11px] rounded bg-sf-h text-tx2 hover:text-tx border border-bd"
      >
        ∞
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="px-2 py-1 text-[11px] text-tx3 hover:text-tx"
      >
        Anuluj
      </button>
    </div>
  );
}

export function StoragePage() {
  const qc = useQueryClient();

  const overviewQ = useQuery<OverviewResp>({
    queryKey: ['storage', 'overview'],
    queryFn: async () => (await api.get<OverviewResp>('/storage/overview')).data,
    refetchInterval: 30_000,
  });

  const wsQ = useQuery<{ workspaces: WorkspaceItem[] }>({
    queryKey: ['storage', 'workspaces'],
    queryFn: async () => (await api.get<{ workspaces: WorkspaceItem[] }>('/storage/workspaces')).data,
    refetchInterval: 30_000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['storage'] });
  };

  if (overviewQ.isLoading || wsQ.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const overview = overviewQ.data;
  const workspaces = wsQ.data?.workspaces ?? [];

  // Group workspaces by type for nicer display
  const grouped = {
    MSP: workspaces.filter((w) => w.type === 'MSP'),
    INTERNAL_IT: workspaces.filter((w) => w.type === 'INTERNAL_IT'),
    CLIENT: workspaces.filter((w) => w.type === 'CLIENT'),
  };

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Pamięć</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            Zużycie dysku VPS + limity dla workspace'ów (Dysk + kopie)
          </p>
        </div>
      </div>

      {/* VPS card */}
      {overview?.vps && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <Server className="h-5 w-5 text-pri" />
            <h2 className="text-[15px] font-semibold text-tx">Serwer VPS — `/var/www`</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Łącznie</div>
              <div className="text-[18px] font-bold text-tx">{humanBytes(overview.vps.totalBytes)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Zajęte</div>
              <div className="text-[18px] font-bold" style={{ color: progressColor(overview.vps.usedPct) }}>
                {humanBytes(overview.vps.usedBytes)} ({overview.vps.usedPct}%)
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Wolne</div>
              <div className="text-[18px] font-bold text-ok">{humanBytes(overview.vps.freeBytes)}</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-sf-h overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${overview.vps.usedPct}%`,
                background: progressColor(overview.vps.usedPct),
              }}
            />
          </div>
        </Card>
      )}

      {/* Summary card */}
      {overview?.summary && (
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <HardDrive className="h-5 w-5 text-pri" />
            <h2 className="text-[15px] font-semibold text-tx">InfraDesk — zużycie aplikacji</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Workspace'y</div>
              <div className="text-[18px] font-bold text-tx">{overview.summary.workspaceCount}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Dysk (pliki)</div>
              <div className="text-[18px] font-bold text-tx">{humanBytes(overview.summary.dyskBytes)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Kopie zapasowe</div>
              <div className="text-[18px] font-bold text-tx">{humanBytes(overview.summary.backupBytes)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tx3 mb-1">Razem (InfraDesk)</div>
              <div className="text-[18px] font-bold text-tx">{humanBytes(overview.summary.totalBytes)}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Workspaces breakdown */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-pri" />
          <h2 className="text-[15px] font-semibold text-tx">Workspace'y — zużycie i limity</h2>
        </div>

        {(['MSP', 'INTERNAL_IT', 'CLIENT'] as const).map((type) => {
          const items = grouped[type];
          if (items.length === 0) return null;
          return (
            <div key={type} className="mb-5 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={TYPE_META[type].variant}>{TYPE_META[type].label}</Badge>
                <span className="text-[11px] text-tx3">{items.length} {items.length === 1 ? 'workspace' : "workspace'ów"}</span>
              </div>
              <div className="space-y-2">
                {items.map((w) => {
                  const pct = w.usedPct ?? 0;
                  const color = progressColor(w.usedPct);
                  return (
                    <div key={w.id} className="rounded-lg border border-bd p-3 hover:border-pri/30 transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold text-tx">{w.name}</div>
                          <div className="text-[11px] text-tx3 mt-0.5">
                            Dysk: {humanBytes(w.dyskBytes)} · Kopie: {humanBytes(w.backupBytes)} · Razem: {humanBytes(w.usedBytes)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <QuotaEditor ws={w} onSaved={refreshAll} />
                        </div>
                      </div>

                      {w.quotaBytes ? (
                        <>
                          <div className="h-1.5 rounded-full bg-sf-h overflow-hidden">
                            <div
                              className="h-full transition-all duration-500"
                              style={{ width: `${Math.min(100, pct)}%`, background: color }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-tx3">{pct?.toFixed(1) ?? '0'}% wykorzystane</span>
                            <span className="text-[10px] text-tx3">
                              wolne: {humanBytes(Number(w.quotaBytes) - Number(w.usedBytes))}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-tx3 mt-1">
                          <InfinityIcon className="h-3 w-3" /> bez limitu
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

export default StoragePage;
