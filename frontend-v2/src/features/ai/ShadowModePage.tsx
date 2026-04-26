import { useQuery } from '@tanstack/react-query';
import { Ghost, Check, X, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

interface ShadowDecision {
  id: string;
  feature: string;
  aiDecision: string;
  humanDecision: string | null;
  matched: boolean | null;
  confidence: number | null;
  contextSummary: string | null;
  createdAt: string;
}

interface Report {
  days: number;
  total: number;
  matched: number;
  mismatched: number;
  unresolved: number;
  matchRate: number;
  byFeature: { feature: string; total: number; matched: number; matchRate: number }[];
}

export function ShadowModePage() {
  const reportQ = useQuery<Report>({
    queryKey: ['ai', 'shadow', 'report'],
    queryFn: async () => (await api.get<Report>('/ai/shadow/report?days=7')).data,
  });
  const decisionsQ = useQuery<{ items: ShadowDecision[] }>({
    queryKey: ['ai', 'shadow', 'list'],
    queryFn: async () => (await api.get<{ items: ShadowDecision[] }>('/ai/shadow?limit=100')).data,
  });

  if (reportQ.isLoading || decisionsQ.isLoading) return <SkeletonCard />;
  const r = reportQ.data;
  const decisions = decisionsQ.data?.items ?? [];

  return (
    <div className="space-y-[var(--sp-4)]">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Ghost size={18} className="text-[var(--pri)]" /> Shadow Mode
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          AI podejmuje decyzje w tle — monitorujemy czy zgadzają się z decyzjami człowieka.
          Gdy match rate &ge; 90%, możemy włączyć auto-execution.
        </p>
      </div>

      {r && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--sp-3)]">
          <StatCard label="Decyzji (7 dni)" value={r.total} />
          <StatCard
            label="Match rate"
            value={`${r.matchRate}%`}
            color={r.matchRate >= 90 ? 'var(--ok)' : r.matchRate >= 70 ? 'var(--wn)' : 'var(--er)'}
          />
          <StatCard label="Zgodnych" value={r.matched} color="var(--ok)" />
          <StatCard label="Niezgodnych" value={r.mismatched} color="var(--er)" />
        </div>
      )}

      {r && r.byFeature.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] text-[13px] font-medium">
            Match rate per funkcjonalność
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {r.byFeature.map((f) => (
              <div key={f.feature} className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)]">
                <div>
                  <div className="text-[13px]">{f.feature}</div>
                  <div className="text-[11px] text-[var(--tx3)]">{f.total} decyzji · {f.matched} zgodnych</div>
                </div>
                <Badge variant={f.matchRate >= 90 ? 'success' : f.matchRate >= 70 ? 'warning' : 'danger'}>
                  {f.matchRate}%
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] text-[13px] font-medium">
          Ostatnie decyzje
        </div>
        <div className="divide-y divide-[var(--bd)]">
          {decisions.length === 0 ? (
            <div className="p-[var(--sp-5)] text-center text-[var(--tx3)]">
              <Ghost size={24} className="mx-auto mb-2 opacity-40" />
              <div className="text-[13px]">Brak decyzji Shadow Mode — AI jeszcze nic nie zasugerowało.</div>
            </div>
          ) : (
            decisions.map((d) => (
              <div key={d.id} className="flex items-start gap-3 px-[var(--sp-4)] py-[var(--sp-3)]">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: d.matched === true ? 'var(--ok-l)' : d.matched === false ? 'var(--er-l)' : 'var(--sf-h)',
                    color: d.matched === true ? 'var(--ok)' : d.matched === false ? 'var(--er)' : 'var(--tx3)',
                  }}
                >
                  {d.matched === true ? <Check size={14} /> : d.matched === false ? <X size={14} /> : <Minus size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="accent">{d.feature}</Badge>
                    {d.confidence !== null && (
                      <span className="text-[11px] text-[var(--tx3)]">confidence {Math.round(d.confidence * 100)}%</span>
                    )}
                  </div>
                  <div className="text-[13px] mt-1">
                    <span className="text-[var(--pri)]">AI:</span> <code>{d.aiDecision}</code>
                    {d.humanDecision && (
                      <>
                        {' · '}
                        <span className="text-[var(--tx2)]">Człowiek:</span> <code>{d.humanDecision}</code>
                      </>
                    )}
                  </div>
                  {d.contextSummary && (
                    <div className="text-[11px] text-[var(--tx3)] mt-0.5">{d.contextSummary}</div>
                  )}
                </div>
                <div className="text-[11px] text-[var(--tx3)] shrink-0">{formatRelativePl(d.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card className="p-[var(--sp-4)]">
      <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider">{label}</div>
      <div className="text-[24px] font-semibold mt-1" style={{ color: color ?? 'var(--tx)' }}>{value}</div>
    </Card>
  );
}
